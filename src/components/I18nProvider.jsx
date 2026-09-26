import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { IntlProvider, useFormatter, useTranslations } from "use-intl";
import {
  MESSAGES, FORMATS, TIME_ZONE, UI_LOCALE_STORAGE_KEY, detectLocale, normalizeLocale, dateArg,
} from "../lib/i18n.js";
import { storageGet, storageSet } from "../storage.js";

/* =========================================================================================
   表示言語の選択と IntlProvider
   ------------------------------------------------------------------------------------------
   初回は navigator.language から判定し（ja* なら日本語、それ以外は英語）、ヘッダーで切り替えた言語は
   window.storage の pm_ui_locale に保存する。UIの設定なので Project JSON・バージョンスナップショット・
   共有用HTMLの埋め込みJSONには含めず、linked / embedded 起動時も保存する（autoSaveDisabled の対象外）。
   ========================================================================================= */

const LocaleSettingContext = createContext({ locale: "ja", setLocale: () => {} });

function initialLocale() {
  return detectLocale(typeof navigator !== "undefined" ? navigator.language : "");
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(initialLocale);
  // 保存済みの言語を読み込むまでは描画しない（初回に別の言語で一瞬表示されるのを避ける）。
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = normalizeLocale(await storageGet(UI_LOCALE_STORAGE_KEY));
      if (cancelled) return;
      if (saved) setLocaleState(saved);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(next => {
    const l = normalizeLocale(next);
    if (!l) return;
    setLocaleState(l);
    storageSet(UI_LOCALE_STORAGE_KEY, l);
  }, []);

  const setting = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  if (!ready) return null;
  return (
    <LocaleSettingContext.Provider value={setting}>
      <IntlProvider locale={locale} messages={MESSAGES[locale]} formats={FORMATS[locale]} timeZone={TIME_ZONE}>
        {children}
      </IntlProvider>
    </LocaleSettingContext.Provider>
  );
}

/** 表示言語と、その切り替え関数。 */
export function useLocaleSetting() {
  return useContext(LocaleSettingContext);
}

/**
 * 翻訳関数 t と、よく使う日付書式をまとめて返す。
 * 日付（YYYY-MM-DD）は UTC の0時として扱い、名前付きの書式（src/lib/i18n.js の FORMATS）で書式化する。
 */
export function useI18n() {
  const t = useTranslations();
  const format = useFormatter();
  return useMemo(() => {
    const byFormat = name => iso => (iso ? format.dateTime(dateArg(iso), name) : "");
    return {
      t,
      format,
      /** 2026/09/26（英語: Sep 26, 2026） */
      fmtDate: byFormat("ymd"),
      /** 表の列など幅が限られる箇所の日付。2026/09/26（英語: 09/26/2026） */
      fmtDateCompact: byFormat("ymdNumeric"),
      /** 09/26（英語: Sep 26） */
      fmtMonthDay: byFormat("md"),
      /** 土（英語: Sat） */
      fmtWeekday: byFormat("weekday"),
      /** 保存日時など（Unixミリ秒・ISO文字列。実行環境のタイムゾーン） */
      fmtDateTime: value => {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? String(value || "") : format.dateTime(d, "dateTime");
      },
    };
  }, [t, format]);
}
