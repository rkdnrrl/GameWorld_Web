import Logo from "@/components/Logo";
import HomeCtas from "@/components/HomeCtas";

export default function Home() {
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6 sm:py-24">
      <div className="w-full max-w-2xl min-w-0 text-center">
        <div className="flex justify-center">
          <Logo size={72} />
        </div>
        <p className="mt-8 break-words text-base text-zinc-600 sm:text-lg dark:text-zinc-400">
          친구들과 함께 즐기는 멀티플레이 게임 플랫폼
        </p>
        <HomeCtas />
      </div>
    </section>
  );
}
