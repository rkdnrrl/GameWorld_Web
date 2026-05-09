import Link from "next/link";
import Logo from "./Logo";

export default function Header() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="ALP 홈">
          <Logo size={28} />
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/games" className="hover:text-blue-600">
            게임
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            로그인
          </Link>
        </nav>
      </div>
    </header>
  );
}
