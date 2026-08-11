"use client";

import { AbstractIntlMessages } from "next-intl";
import { FiPlus } from "react-icons/fi";
import GitHubSignInButton from "./GitHubSignInButton";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCanEdit } from "./EditContext";

export default function CreateButton({
  messages,
}: {
  messages: AbstractIntlMessages;
}) {
  const pathname = usePathname();
  const canEdit = useCanEdit();

  const isMemosPage = pathname === "/" || pathname === "/memos";
  const isBlogPage = pathname === "/blog";
  const createLink = isBlogPage ? "/editor?type=blog" : "/editor?type=memo";

  // Editing available (local, or GitHub with a token) → show the + button.
  if (!canEdit) {
    return (
      <div className="fixed bottom-9 right-9 z-20">
        <GitHubSignInButton />
      </div>
    );
  }

  return (
    <Link
      href={createLink}
      className="fixed bottom-9 right-9 p-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-lg z-20 flex items-center justify-center"
    >
      <FiPlus className="w-6 h-6" aria-hidden="true" />
      <span className="sr-only">
        {isMemosPage
          ? (messages.createNewMemo as string)
          : (messages.createNewBlogPost as string)}
      </span>
    </Link>
  );
}
