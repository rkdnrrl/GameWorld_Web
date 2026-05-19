import Logo from "@/components/Logo";
import DungeonHomeScene from "@/components/DungeonHomeScene";
import HomeCtas from "@/components/HomeCtas";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations("Home");

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col items-center gap-3">
        <Logo size={56} />
        <p className="break-words text-center text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
          {t("tagline")}
        </p>
      </div>
      <DungeonHomeScene />
      <HomeCtas />
    </section>
  );
}
