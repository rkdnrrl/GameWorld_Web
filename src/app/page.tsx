import Logo from "@/components/Logo";
import HomeCtas from "@/components/HomeCtas";

export default function Home() {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-2xl text-center">
        <div className="flex justify-center">
          <Logo size={72} />
        </div>
        <p className="mt-8 text-lg text-zinc-600 dark:text-zinc-400">
          친구들과 함께 즐기는 멀티플레이 게임 플랫폼
        </p>
        <HomeCtas />
      </div>
    </section>
  );
}
