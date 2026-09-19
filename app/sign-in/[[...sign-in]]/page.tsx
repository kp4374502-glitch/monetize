import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex justify-center p-8">
      <SignIn />
    </main>
  );
}
