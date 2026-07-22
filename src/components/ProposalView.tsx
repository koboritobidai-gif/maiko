"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import ProposalDocument, { buildProposalText } from "@/components/ProposalDocument";
import SourceBadge from "@/components/SourceBadge";
import { IconDocument } from "@/components/icons";
import { getBranchById } from "@/lib/metrics";
import type { Branch, Candidate } from "@/lib/types";
import {
  AGE_BANDS,
  CHANGE_REASONS,
  type AgeBand,
  type ChangeReason,
  type ProposalResult,
} from "@/lib/ai/proposal-gen";

interface ProposalViewProps {
  candidates: Candidate[];
  branches: Branch[];
}

export default function ProposalView({ candidates, branches }: ProposalViewProps) {
  const [candidateName, setCandidateName] = useState("");
  const [selectedDemoId, setSelectedDemoId] = useState("");
  const [ageBand, setAgeBand] = useState<AgeBand>("30代");
  const [currentRole, setCurrentRole] = useState("");
  const [desiredRole, setDesiredRole] = useState("");
  const [desiredIncomeMan, setDesiredIncomeMan] = useState("");
  const [desiredLocation, setDesiredLocation] = useState("");
  const [reason, setReason] = useState<ChangeReason>("キャリアアップ");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposalResult | null>(null);

  function handleDemoSelect(id: string) {
    setSelectedDemoId(id);
    if (!id) return;
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;
    setCandidateName(candidate.name);
    setDesiredRole(candidate.desiredRole);
    setDesiredIncomeMan(String(Math.round(candidate.expectedAnnualIncome / 10000)));
    const branchName = getBranchById(branches, candidate.branchId)?.name;
    if (branchName) setDesiredLocation(branchName);
  }

  const incomeValue = Number(desiredIncomeMan);
  const canSubmit =
    currentRole.trim().length > 0 &&
    desiredRole.trim().length > 0 &&
    desiredLocation.trim().length > 0 &&
    Number.isFinite(incomeValue) &&
    incomeValue > 0 &&
    !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName,
          ageBand,
          currentRole,
          desiredRole,
          desiredIncomeMan: incomeValue,
          desiredLocation,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "生成に失敗しました。");
        return;
      }
      setResult(data as ProposalResult);
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const inputClass =
    "card w-full p-2.5 text-[13px] outline-none";
  const labelClass = "text-[11px] font-medium";

  return (
    <div className="flex flex-col gap-6 px-4 pt-4">
      {/* 説明ヘッダー */}
      <section className="flex flex-col gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: "color-mix(in srgb, var(--color-navy) 8%, transparent)",
              color: "var(--color-navy)",
            }}
          >
            <IconDocument width={24} height={24} />
          </div>
          <h1 className="text-base font-bold" style={{ color: "var(--color-navy)" }}>
            提案書(AI推薦状ジェネレーター)
          </h1>
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          求職者条件を入力すると、企業向けの推薦状・提案書(推薦理由・スキルサマリ・想定手数料つき)をA4風プレビューで生成します。
        </p>
      </section>

      {/* フォーム */}
      <section className="flex flex-col gap-3 print:hidden">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--color-text-muted)" }}>
            求職者名(任意)
          </label>
          <input
            type="text"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="例: 田中 悠斗(未入力の場合は「本求職者」と表記)"
            className={inputClass}
          />
          <select
            value={selectedDemoId}
            onChange={(e) => handleDemoSelect(e.target.value)}
            className={inputClass}
            style={{ color: "var(--color-text-muted)" }}
          >
            <option value="">デモ求職者から選ぶ(任意)</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}・{c.desiredRole}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--color-text-muted)" }}>
            年齢層
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {AGE_BANDS.map((band) => (
              <button
                key={band}
                type="button"
                onClick={() => setAgeBand(band)}
                className="rounded-lg py-2 text-[12px] font-medium transition-colors"
                style={{
                  background: ageBand === band ? "var(--color-navy)" : "var(--color-card)",
                  color: ageBand === band ? "#f2efe6" : "var(--color-text)",
                  border: `1px solid ${ageBand === band ? "var(--color-navy)" : "var(--color-border)"}`,
                }}
              >
                {band}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--color-text-muted)" }}>
              現職種
            </label>
            <input
              type="text"
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value)}
              placeholder="例: 受託開発エンジニア"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--color-text-muted)" }}>
              希望職種
            </label>
            <input
              type="text"
              value={desiredRole}
              onChange={(e) => setDesiredRole(e.target.value)}
              placeholder="例: Webエンジニア"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--color-text-muted)" }}>
              希望年収(万円)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={desiredIncomeMan}
              onChange={(e) => setDesiredIncomeMan(e.target.value)}
              placeholder="例: 600"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} style={{ color: "var(--color-text-muted)" }}>
              希望勤務地
            </label>
            <input
              type="text"
              value={desiredLocation}
              onChange={(e) => setDesiredLocation(e.target.value)}
              placeholder="例: 東京(リモート併用可)"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--color-text-muted)" }}>
            転職目的
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {CHANGE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="rounded-lg py-2 text-[12px] font-medium transition-colors"
                style={{
                  background: reason === r ? "var(--color-navy)" : "var(--color-card)",
                  color: reason === r ? "#f2efe6" : "var(--color-text)",
                  border: `1px solid ${reason === r ? "var(--color-navy)" : "var(--color-border)"}`,
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-1 rounded-xl py-3 text-center text-[13px] font-bold transition-opacity"
          style={{
            background: "var(--color-navy)",
            color: "#f2efe6",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {loading ? "生成中…" : "AI推薦状を生成する"}
        </button>
        {error && (
          <p className="text-[12px]" style={{ color: "var(--color-bad)" }}>
            {error}
          </p>
        )}
      </section>

      {/* プレビュー */}
      {result && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
              提案書プレビュー
            </h2>
            <SourceBadge label={result.source === "claude" ? "Claude API" : "デモ生成"} />
          </div>

          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 rounded-full py-2 text-center text-[12px] font-medium"
              style={{
                background: "color-mix(in srgb, var(--color-navy) 8%, transparent)",
                color: "var(--color-navy)",
              }}
            >
              印刷する
            </button>
            <CopyButton
              getText={() => buildProposalText(result)}
              label="全文をコピー"
              copiedLabel="コピーしました"
              className="flex-1 rounded-full py-2 text-center text-[12px] font-medium"
            />
          </div>

          <ProposalDocument result={result} />
        </section>
      )}
    </div>
  );
}
