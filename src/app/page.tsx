import Link from "next/link";

export default function Home() {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          GameWorld
        </h1>
        <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400">
          친구들과 함께 즐기는 멀티플레이 게임 플랫폼
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/games"
            className="rounded-md bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700"
          >
            게임 둘러보기
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-zinc-300 px-6 py-3 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            회원가입
          </Link>
        </div>
      </div>
    </section>
  );
}
