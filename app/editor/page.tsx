import EditorComponent from "@/components/Editor";
import GitHubSignInButton from "@/components/GitHubSignInButton";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth/next";
import { isAuthorizedToWrite } from "@/lib/runtime/authz";

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { type } = await searchParams;
  const defaultType = type === "blog" ? "blog" : "memo";

  // Editing is restricted to the repo owner (hosted OAuth), the local user
  // (`--dir`), or a preset CICI_TOKEN on the localhost CLI. See lib/runtime/authz.
  if (!(await isAuthorizedToWrite(session))) {
    // Signed in but not the owner → say so; otherwise offer GitHub sign-in.
    if (session) {
      return (
        <div className="px-4 sm:px-6 lg:px-8 py-16 text-center text-muted-foreground">
          Only the site owner can edit this blog.
        </div>
      );
    }
    return <GitHubSignInButton />;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <EditorComponent defaultType={defaultType} />
    </div>
  );
}
