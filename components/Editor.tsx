"use client";

import "katex/dist/katex.min.css";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ExternalDiscussion } from "discussing";

import { Button } from "@/components/ui/button";
import { CgImage } from "react-icons/cg";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import React from "react";
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from "react-syntax-highlighter";
import { Textarea } from "@/components/ui/textarea";
import { createGitHubAPIClient } from "@/lib/client"
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import { uploadImage } from "@/lib/githubApi";
import { useDropzone } from "react-dropzone";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import { useGeolocation } from "@/hooks/useGeolocation";
import { extractTitleFromContent, getContentPlaceholder } from "@/lib/titleUtils";

function removeFrontmatter(content: string): string {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  return content.replace(frontmatterRegex, "");
}

export default function Editor({
  defaultType = "memo",
}: {
  defaultType?: "memo" | "blog";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [content, setContent] = useState("");
  const [type, setType] = useState(
    (searchParams.get("type") as "memo" | "blog") || defaultType
  );
  const [isPreview, setIsPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const t = useTranslations("HomePage");
  const { data: session } = useSession();
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const { toast } = useToast();
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [discussions, setDiscussions] = useState<ExternalDiscussion[]>([]);
  const { location, loading: locationLoading, requestLocation } = useGeolocation();
  const [postLocation, setPostLocation] = useState<{
    latitude?: number;
    longitude?: number;
    city?: string;
    street?: string;
  } | null>(null);
  const [isLocationAttached, setIsLocationAttached] = useState(false);
  const [isPublished, setIsPublished] = useState(true);
  const [isMemoLocationIgnored, setIsMemoLocationIgnored] = useState(false);

  const fetchMemo = useCallback(
    async (id: string) => {
      if (!session?.accessToken) return;
      try {
        const memos = await createGitHubAPIClient(session.accessToken).getMemos()
        const memo = memos.find((t) => t.id === id);
        if (memo) {
          setContent(memo.content);
        }
      } catch (error) {
        console.error("Error fetching memo:", error);
      }
    },
    [session?.accessToken]
  );

  const fetchBlogPost = useCallback(
    async (id: string) => {
      if (!session?.accessToken) return;
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query GetBlogPost($id: String!) {
                blogPost(id: $id) {
                  id
                  title
                  content
                  status
                  latitude
                  longitude
                  city
                  street
                  discussions {
                    platform
                    url
                    title
                    count
                  }
                }
              }
            `,
            variables: { id },
          }),
        });
        
        const result = await response.json();
        if (result.errors) {
          throw new Error(result.errors[0].message);
        }
        
        const blogPost = result.data.blogPost;
        if (blogPost) {
          // For existing posts, preserve the full content including title
          setContent(removeFrontmatter(blogPost.content));
          setDiscussions(blogPost.discussions || []);
          setEditingMemoId(id);
          setIsPublished(blogPost.status === 'published');
          
          // Set existing location if available
          if (blogPost.latitude || blogPost.city) {
            setPostLocation({
              latitude: blogPost.latitude,
              longitude: blogPost.longitude,
              city: blogPost.city,
              street: blogPost.street
            });
            setIsLocationAttached(true);
          }
        }
      } catch (error) {
        console.error("Error fetching blog post:", error);
      }
    },
    [session?.accessToken]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("type", type);
    router.push(`/editor?${params.toString()}`);

    const id = searchParams.get("id");

    if (id) {
      setEditingMemoId(id);
      if (type === "blog") {
        fetchBlogPost(id);
      } else if (type === "memo") {
        fetchMemo(id);
      }
    }
  }, [type, router, searchParams, fetchMemo, fetchBlogPost]);

  const handleTypeChange = (value: "blog" | "memo") => {
    setType(value);
    // Clear content and state when switching modes
    setContent("");
    setEditingMemoId(null);
    setDiscussions([]);
    setPostLocation(null);
    setIsLocationAttached(false);
    setIsMemoLocationIgnored(false);
    setIsPublished(true);
    
    // Navigate to clean URL without ID parameter
    router.push(`/editor?type=${value}`);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);
    try {
      let query: string;
      let variables: Record<string, unknown>;

      if (type === "blog") {
        // Use unified saveBlogPost mutation for both create and update
        query = `
          mutation SaveBlogPost($id: String, $input: SaveBlogPostInput!) {
            saveBlogPost(id: $id, input: $input) {
              id
              title
              content
              status
            }
          }
        `;
        variables = {
          ...(editingMemoId && { id: editingMemoId }),
          input: {
            title: extractTitleFromContent(content),
            content,
            status: isPublished ? 'published' : 'draft',
            discussions,
            ...(isLocationAttached && postLocation && {
              latitude: postLocation.latitude,
              longitude: postLocation.longitude,
              city: postLocation.city,
              street: postLocation.street
            })
          },
        };
      } else {
        if (editingMemoId) {
          // Update memo
          query = `
            mutation UpdateMemo($id: String!, $input: UpdateMemoInput!) {
              updateMemo(id: $id, input: $input) {
                id
                content
                timestamp
              }
            }
          `;
          variables = {
            id: editingMemoId,
            input: {
              content,
            },
          };
        } else {
          // Create memo
          query = `
            mutation CreateMemo($input: CreateMemoInput!) {
              createMemo(input: $input) {
                id
                content
                timestamp
              }
            }
          `;
          variables = {
            input: {
              content,
              ...(location && {
                latitude: location.latitude,
                longitude: location.longitude,
                city: location.city,
                street: location.street
              })
            },
          };
        }
      }

      const response = await fetch("/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      if (!response.ok) {
        throw new Error(t("failedPublish"));
      }

      setIsSuccess(true);
      toast({
        title: t("success"),
        description: editingMemoId
          ? `${type === "blog" ? t("blogPostUpdated") : t("memoUpdated")}`
          : `${type === "blog" ? (isPublished ? t("blogPostCreated") : "Draft saved") : t("memoCreated")}`,
        duration: 3000,
      });
      setTimeout(() => {
        if (type === "blog") {
          router.push("/blog");
        } else {
          router.push("/memos");
        }
      }, 2000);
    } catch (error) {
      console.error("Error publishing:", error);
      toast({
        title: t("error"),
        description: t("failedPublish"),
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!session?.accessToken) {
        toast({
          title: t("error"),
          description: t("notAuthenticated"),
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setIsImageUploading(true);
      try {
        const imageUrl = await uploadImage(file, session.accessToken);
        const imageMarkdown = `![${file.name}](${imageUrl})`;

        if (cursorPosition !== null) {
          const newContent =
            content.slice(0, cursorPosition) +
            imageMarkdown +
            content.slice(cursorPosition);
          setContent(newContent);
        } else {
          setContent((prevContent) => prevContent + "\n\n" + imageMarkdown);
        }

        toast({
          title: t("success"),
          description: t("imageUploaded"),
          duration: 3000,
        });
      } catch (error) {
        console.error("Error uploading image:", error);
        toast({
          title: t("error"),
          description: t("imageUploadFailed"),
          variant: "destructive",
          duration: 3000,
        });
      } finally {
        setIsImageUploading(false);
      }
    },
    [session?.accessToken, cursorPosition, content, toast, t]
  );

  const addDiscussion = () => {
    setDiscussions([...discussions, { platform: 'v2ex', url: '' }]);
  };

  const removeDiscussion = (index: number) => {
    setDiscussions(discussions.filter((_, i) => i !== index));
  };

  const updateDiscussion = (index: number, field: keyof ExternalDiscussion, value: string) => {
    const updated = discussions.map((discussion, i) => 
      i === index ? { ...discussion, [field]: value } : discussion
    );
    setDiscussions(updated);
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        if (file.type.startsWith("image/")) {
          await handleImageUpload(file);
        } else {
          toast({
            title: t("error"),
            description: t("onlyImagesAllowed"),
            variant: "default",
            duration: 3000,
          });
        }
      }
    },
    [handleImageUpload, toast, t]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: {
      "image/*": [],
    },
  });

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (!session?.accessToken) {
        toast({
          title: t("error"),
          description: t("notAuthenticated"),
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      const items = Array.from(e.clipboardData.items);
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          setIsImageUploading(true);

          try {
            const file = item.getAsFile();
            if (!file) continue;

            const imageUrl = await uploadImage(file, session.accessToken);
            const imageMarkdown = `![${
              file.name || "Pasted image"
            }](${imageUrl})`;

            if (cursorPosition !== null) {
              const newContent =
                content.slice(0, cursorPosition) +
                imageMarkdown +
                content.slice(cursorPosition);
              setContent(newContent);
            } else {
              setContent((prevContent) => prevContent + "\n\n" + imageMarkdown);
            }

            toast({
              title: t("success"),
              description: t("imageUploaded"),
              duration: 3000,
            });
          } catch (error) {
            console.error("Error uploading pasted image:", error);
            toast({
              title: t("error"),
              description: t("imageUploadFailed"),
              variant: "destructive",
              duration: 3000,
            });
          } finally {
            setIsImageUploading(false);
          }
        }
      }
    },
    [session?.accessToken, cursorPosition, content, toast, t]
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {(isLoading || isImageUploading) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-xl">
            <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
          </div>
        </div>
      )}
      
      {/* Header - Clean and minimal */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          {/* Draft/Published toggle on the left */}
          {type === "blog" && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setIsPublished(false)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  !isPublished 
                    ? "bg-white text-black shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
                disabled={isLoading || isImageUploading}
              >
                Draft
              </button>
              <button
                type="button"
                onClick={() => setIsPublished(true)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isPublished 
                    ? "bg-white text-black shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
                disabled={isLoading || isImageUploading}
              >
                Published
              </button>
            </div>
          )}
          {type === "memo" && <div />} {/* Empty div to maintain justify-between spacing */}
          
          {/* Memo/Blog selector on the right */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleTypeChange("memo")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                type === "memo" 
                  ? "bg-white text-black shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Memo
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange("blog")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                type === "blog" 
                  ? "bg-white text-black shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Blog
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

          

          {/* Content Editor */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" {...getRootProps()}>
            <input {...getInputProps()} />
            <div className="border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between px-4">
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => setIsPreview(false)}
                    className={`px-4 py-3 text-sm font-medium transition-colors ${
                      !isPreview 
                        ? "text-blue-600 border-b-2 border-blue-600 bg-white" 
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                    disabled={isLoading || isImageUploading}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPreview(true)}
                    className={`px-4 py-3 text-sm font-medium transition-colors ${
                      isPreview 
                        ? "text-blue-600 border-b-2 border-blue-600 bg-white" 
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                    disabled={isLoading || isImageUploading}
                  >
                    Preview
                  </button>
                </div>
                <label
                  htmlFor="image-upload"
                  className="p-2 text-gray-600 hover:text-gray-900 cursor-pointer transition-colors"
                  title="Upload image"
                >
                  <CgImage className="h-5 w-5" />
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleImageUpload(e.target.files[0]);
                      }
                    }}
                    disabled={isLoading || isImageUploading}
                  />
                </label>
              </div>
            </div>
            {isPreview ? (
              <div className="p-6 prose prose-gray max-w-none min-h-[400px]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code({
                      inline,
                      className,
                      children,
                      ...props
                    }: {
                      inline?: boolean;
                      className?: string;
                      children?: React.ReactNode;
                    } & React.HTMLAttributes<HTMLElement>) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={
                            tomorrow as { [key: string]: React.CSSProperties }
                          }
                          language={match[1]}
                          PreTag="div"
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                    a: ({ children, ...props }) => (
                      <a
                        {...props}
                        className="text-gray-400 no-underline hover:text-gray-600 hover:underline hover:underline-offset-4 transition-colors duration-200 break-words"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    ),
                    blockquote: ({ children }) => (
                      <div className="pl-4 border-l-4 border-gray-200 text-gray-400">
                        {children}
                      </div>
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onSelect={(e) =>
                  setCursorPosition(e.currentTarget.selectionStart)
                }
                onPaste={handlePaste}
                placeholder={getContentPlaceholder(type)}
                className="min-h-[400px] p-6 border-0 focus:ring-0 resize-none"
                required
                disabled={isLoading || isImageUploading}
              />
            )}
            {isDragActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 border-2 border-dashed border-blue-400 rounded-lg">
                <div className="text-center">
                  <CgImage className="h-12 w-12 mx-auto text-blue-500 mb-2" />
                  <p className="text-lg font-medium text-gray-700">Drop image here</p>
                </div>
              </div>
            )}
          </div>

          {/* Location Section - Only show when location is attached */}
          {type === "blog" && isLocationAttached && postLocation && (
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <span>📍</span>
                  <span>{postLocation.city}{postLocation.street ? ` · ${postLocation.street}` : ''}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await requestLocation();
                      if (location) {
                        setPostLocation(location);
                        setIsLocationAttached(true);
                        toast({
                          title: "Location updated",
                          description: `${location.city}${location.street ? ` · ${location.street}` : ''}`,
                          duration: 3000,
                        });
                      }
                    }}
                    disabled={locationLoading}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {locationLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Update"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPostLocation(null);
                      setIsLocationAttached(false);
                      toast({
                        title: "Location removed",
                        duration: 2000,
                      });
                    }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* External Discussions - Only show when discussions exist */}
          {type === "blog" && discussions.length > 0 && (
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">
                  External Discussions ({discussions.length})
                </span>
              </div>
              <div className="space-y-2">
                {discussions.map((discussion, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <select
                      value={discussion.platform}
                      onChange={(e) => updateDiscussion(index, 'platform', e.target.value as ExternalDiscussion['platform'])}
                      className="px-2 py-1.5 border border-gray-200 rounded text-xs bg-white"
                      disabled={isLoading || isImageUploading}
                    >
                      <option value="v2ex">V2EX</option>
                      <option value="reddit">Reddit</option>
                      <option value="hackernews">Hacker News</option>
                    </select>
                    <Input
                      type="url"
                      value={discussion.url}
                      onChange={(e) => updateDiscussion(index, 'url', e.target.value)}
                      placeholder="Paste discussion URL..."
                      className="flex-1 border-gray-200 text-xs h-8"
                      disabled={isLoading || isImageUploading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDiscussion(index)}
                      disabled={isLoading || isImageUploading}
                      className="text-xs text-red-500 hover:text-red-700 h-8 px-2"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location for Memos - Only show when location is available and not ignored */}
          {type === "memo" && location && !isMemoLocationIgnored && (
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <span>📍</span>
                  <span>{location.city}{location.street ? ` · ${location.street}` : ''}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await requestLocation();
                      toast({
                        title: "Location updated",
                        description: location ? `${location.city}${location.street ? ` · ${location.street}` : ''}` : "Location refreshed",
                        duration: 3000,
                      });
                    }}
                    disabled={locationLoading}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {locationLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Update"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsMemoLocationIgnored(true);
                      toast({
                        title: "Location removed",
                        description: "Location will not be included with this memo",
                        duration: 2000,
                      });
                    }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Add Location button for Blog posts when no location attached */}
              {type === "blog" && !isLocationAttached && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await requestLocation();
                    if (location) {
                      setPostLocation(location);
                      setIsLocationAttached(true);
                      toast({
                        title: "Location attached",
                        description: `${location.city}${location.street ? ` · ${location.street}` : ''}`,
                        duration: 3000,
                      });
                    }
                  }}
                  disabled={locationLoading}
                  className="flex items-center gap-2 text-sm"
                >
                  {locationLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="text-base">📍</span>
                  )}
                  Add Location
                </Button>
              )}
              {/* Add Location button for Memos when no location detected or location was ignored */}
              {type === "memo" && (!location || isMemoLocationIgnored) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setIsMemoLocationIgnored(false); // Un-ignore location
                    await requestLocation();
                    if (location) {
                      toast({
                        title: "Location detected",
                        description: `${location.city}${location.street ? ` · ${location.street}` : ''}`,
                        duration: 3000,
                      });
                    }
                  }}
                  disabled={locationLoading}
                  className="flex items-center gap-2 text-sm"
                >
                  {locationLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="text-base">📍</span>
                  )}
                  Add Location
                </Button>
              )}
              {/* Add Discussion Link for Blog posts */}
              {type === "blog" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDiscussion}
                  disabled={isLoading || isImageUploading}
                  className="text-sm"
                >
                  + Add Discussion Link
                </Button>
              )}
              {isSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
                  {t("successPublished")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(type === "blog" ? "/blog" : "/memos")}
                disabled={isLoading || isImageUploading}
                className="px-6"
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={isLoading || isImageUploading || !content}
                className="px-8 bg-black hover:bg-gray-800 text-white disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("saving")}
                  </>
                ) : (
                  <>
                    {editingMemoId ? "Update" : "Save"}
                    {type === "blog" ? " Post" : " Memo"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
    </div>
  );
}
