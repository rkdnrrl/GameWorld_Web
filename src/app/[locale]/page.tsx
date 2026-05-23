import { Link } from "@/i18n/navigation";
import HomeCtas from "@/components/HomeCtas";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations("Home");

  const features = [
    { emoji: "🎒", title: t("feat1Title"), desc: t("feat1Desc") },
    { emoji: "🕹️", title: t("feat2Title"), desc: t("feat2Desc") },
    { emoji: "👥", title: t("feat3Title"), desc: t("feat3Desc") },
  ];

  return (
    <div className="flex flex-1 flex-col bg-[#313338]">
      {/* ── 히어로 ── */}
      <section className="relative overflow-hidden px-6 py-24 text-center sm:py-32">
        {/* 배경 그라디언트 */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[#5865f2]/20 blur-[120px]" />
          <div className="absolute -right-40 bottom-0 h-[400px] w-[400px] rounded-full bg-[#eb459e]/15 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-3xl">
          <h1 className="whitespace-pre-line text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-[#b5bac1] sm:text-lg">
            {t("heroSub")}
          </p>
          <HomeCtas />
        </div>
      </section>

      {/* ── 피처 카드 ── */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg bg-[#2b2d31] p-6 transition-colors hover:bg-[#35373c]"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#5865f2]/20 text-2xl">
                {f.emoji}
              </div>
              <h3 className="mb-1.5 text-base font-bold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-[#b5bac1]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 하단 배너 ── */}
      <section className="border-t border-[#3f4147] bg-[#2b2d31] px-6 py-14 text-center">
        <p className="mb-6 text-2xl font-bold text-white sm:text-3xl">
          {t("browsGames")} →
        </p>
        <Link
          href="/games"
          className="inline-block rounded-full bg-[#5865f2] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
        >
          {t("startNow")}
        </Link>
      </section>
    </div>
  );
}
