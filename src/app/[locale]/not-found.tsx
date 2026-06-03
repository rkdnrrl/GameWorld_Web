import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("Home");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1020] px-4 py-16 text-white">
      <div className="max-w-md text-center">
        <div className="mb-6 text-7xl font-extrabold tracking-tight text-white/30 sm:text-9xl">
          404
        </div>
        <h1 className="mb-4 text-2xl font-bold sm:text-3xl">{t("notFoundTitle")}</h1>
        <p className="mb-8 whitespace-pre-line text-sm leading-relaxed text-white/60 sm:text-base">
          {t("notFoundSub")}
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 active:scale-95 sm:text-base"
        >
          🌍 {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
