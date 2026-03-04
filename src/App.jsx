import { useState, useMemo, useEffect } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

// ── カラーパレット ────────────────────────────────────────────────
const C = {
  bg: "#F0F4F8", panel: "#FFFFFF", dark: "#1A2332",
  accent: "#3B82F6", green: "#10B981", border: "#E2E8F0",
  text: "#1E293B", muted: "#94A3B8", red: "#EF4444",
  yellow: "#F59E0B", purple: "#8B5CF6", orange: "#F97316",
};

const BASE_YEAR = new Date().getFullYear();

// ── デフォルト値（汎用） ──────────────────────────────────────────
const DEFAULTS = {
  // STEP1: プロフィール
  married: true,
  myAge: 30, myTakeHome: 400, myIncomeGrowth: 1.0,
  myRetireAge: 65, myPension: 150, myCash: 200, myNisaBalance: 0,
  myRetireBonus: 500,
  hasSpouse: true,
  spouseAge: 28, spouseTakeHome: 250, spouseIncomeGrowth: 1.0,
  spouseRetireAge: 63, spousePension: 100, spouseCash: 100, spouseNisaBalance: 0,
  spouseRetireBonus: 0,
  spouseAdjEnabled: false, spouseAdjStart: BASE_YEAR+1, spouseAdjEnd: BASE_YEAR+3, spouseAdjRatio: 0,
  childCount: 0, child1Age: -1, child2Age: -1,
  lifeExpectancy: 90,
  // STEP2: 収支
  food: 60, daily: 10, utility: 20, comm: 12,
  transport: 12, leisure: 30, insurance: 60,
  clothing: 10, medical: 8, other: 20,
  eduNursery: 30, eduElementary: 60, eduJunior: 114, eduHigh: 97, eduCollege: 103,
  // 住宅タイプ
  housingType: "rent",  // "rent" | "own"
  // 家賃セグメント（賃貸の場合）: [{endYear, amount}] 最後のセグメントはendYear不要
  rentSegments: [{ amount: 120 }],
  // 固定資産税（持ち家の場合は住宅購入価格から自動計算も可）
  propertyTaxEnabled: true,
  propertyTaxRate: 0.14,  // 実効税率 %（課税評価額×1.4%×軽減）
  // 不動産評価額（グラフ表示用）
  propertyInitialValue: 0,   // 購入価格（万円）
  propertyBuildYear: BASE_YEAR,  // 建築年（築年数計算用）
  propertyDepreciationRate: 1.5, // 年間減価率 %（木造: 約2%、RC: 約1%）
  // STEP3: 投資
  myNisaAnnual1: 0, myNisaAnnual2: 0, myNisaAnnual3: 0,
  myNisaStart: BASE_YEAR, myNisaEnd: BASE_YEAR+35, myNisaReturn: 5.0,
  myNisaTsumiUsed: 0, myNisaGrowthUsed: 0,
  spouseNisaAnnual1: 0, spouseNisaAnnual2: 0, spouseNisaAnnual3: 0,
  spouseNisaStart: BASE_YEAR, spouseNisaEnd: BASE_YEAR+35, spouseNisaReturn: 5.0,
  spouseNisaTsumiUsed: 0, spouseNisaGrowthUsed: 0,
  myStockAnnual1: 0, myStockAnnual2: 0, myStockAnnual3: 0,
  myStockStart: BASE_YEAR, myStockEnd: BASE_YEAR+35, myStockReturn: 6.0,
  spouseStockAnnual1: 0, spouseStockAnnual2: 0, spouseStockAnnual3: 0,
  spouseStockStart: BASE_YEAR, spouseStockEnd: BASE_YEAR+30, spouseStockReturn: 6.0,
  cashReturn: 0.3,
  kid1NisaAnnual: 0, kid1NisaStart: BASE_YEAR+1, kid1NisaEnd: BASE_YEAR+15, kid1NisaWithdraw: BASE_YEAR+18,
  kid2NisaAnnual: 0, kid2NisaStart: BASE_YEAR+1, kid2NisaEnd: BASE_YEAR+15, kid2NisaWithdraw: BASE_YEAR+20,
  kidNisaReturn: 5.0,
  // STEP4: 不動産（複数物件対応）
  houseCount: 0,  // 住宅変更回数（0=購入しない）
  houses: [],     // [{year, cashPrice, loan, loanRate, loanYears, investWithdraw, investSource}]
  // 変動係数適用
  useIncomeCoef: true,
  // イベント・実績
  events: [], actuals: [],
};

// ── ユーティリティ ────────────────────────────────────────────────
const fmt = v => `${Math.round(v).toLocaleString()}万円`;

// ── UIコンポーネント ──────────────────────────────────────────────
const Num = ({ value, onChange, min = 0, max = 9999, step = 1, unit = "", color = C.accent, width = 72 }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const bump = d => onChange(Math.min(max, Math.max(min, Math.round((value + d) * 100) / 100)));
  const bs = side => ({
    width: 32, height: 32, borderRadius: side === "l" ? "8px 0 0 8px" : "0 8px 8px 0",
    border: `2px solid ${color}`, borderLeft: side === "r" ? "none" : undefined,
    borderRight: side === "l" ? "none" : undefined,
    background: "#F8FAFC", color, fontSize: 18, fontWeight: 700,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ display: "flex" }}>
        <button onClick={() => bump(-step)} style={bs("l")}>－</button>
        <input inputMode="decimal"
          value={editing ? draft : value}
          onFocus={() => { setDraft(String(value)); setEditing(true); }}
          onBlur={() => { setEditing(false); const n = Number(draft); if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n))); }}
          onChange={e => setDraft(e.target.value)}
          style={{ width, height: 32, padding: "0 4px", border: `2px solid ${color}`, borderLeft: "none", borderRight: "none", fontSize: 13, fontWeight: 700, textAlign: "center", color: C.dark, outline: "none", background: "#fff" }} />
        <button onClick={() => bump(step)} style={bs("r")}>＋</button>
      </div>
      {unit && <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{unit}</span>}
    </div>
  );
};

const Row = ({ label, sub, children }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
    <div style={{ flex: 1, paddingRight: 8 }}>
      <div style={{ fontSize: 13, color: C.text }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
    {children}
  </div>
);

const Toggle = ({ value, onChange, color = C.accent }) => (
  <button onClick={() => onChange(!value)}
    style={{ width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", background: value ? color : "#CBD5E1", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: value ? 25 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
  </button>
);

const Chip = ({ label, selected, onClick, color = C.accent }) => (
  <button onClick={onClick} style={{
    padding: "8px 16px", borderRadius: 20, border: `2px solid ${selected ? color : C.border}`,
    background: selected ? color : "#fff", color: selected ? "#fff" : C.muted,
    fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
  }}>{label}</button>
);

const Card = ({ children, color, mb = 16 }) => (
  <div style={{ background: C.panel, borderRadius: 16, padding: "0 16px 16px", border: `1.5px solid ${color || C.border}`, marginBottom: mb }}>
    {children}
  </div>
);

const SH = ({ title, icon, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0 6px" }}>
    <span style={{ fontSize: 16 }}>{icon}</span>
    <span style={{ fontSize: 13, fontWeight: 700, color: color || C.accent }}>{title}</span>
  </div>
);

// 3期間入力グリッド
const Period3 = ({ values, onChange, max, step = 1, unit = "万", labels }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8, marginBottom: 4 }}>
    {labels.map((label, i) => (
      <div key={i}>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textAlign: "center", lineHeight: 1.3 }}>{label}</div>
        <Num value={values[i]} onChange={v => onChange(i, v)} min={0} max={max} step={step} unit={unit} width={52} />
      </div>
    ))}
  </div>
);

// ── 収入変動係数（FP標準値）────────────────────────────────────────
// 出典: 年齢帯ごとの収入変動係数（ライフプランFP参考値）
const INCOME_COEF = [
  { maxAge: 19,  coef: 1.321 },
  { maxAge: 24,  coef: 1.046 },
  { maxAge: 29,  coef: 1.024 },
  { maxAge: 34,  coef: 1.024 },
  { maxAge: 39,  coef: 1.017 },
  { maxAge: 44,  coef: 1.011 },
  { maxAge: 49,  coef: 1.011 },
  { maxAge: 54,  coef: 1.005 },
  { maxAge: 59,  coef: 1.005 },
  { maxAge: 64,  coef: 1.005 },
  { maxAge: 69,  coef: 1.005 },
  { maxAge: 999, coef: 0.883 },  // 70歳〜
];

// 基準年収から変動係数を累積適用して指定年齢の収入を計算
function applyCoef(baseTakeHome, baseAge, targetAge) {
  let income = baseTakeHome;
  for (let age = baseAge; age < targetAge; age++) {
    const entry = INCOME_COEF.find(e => age <= e.maxAge) || INCOME_COEF[INCOME_COEF.length - 1];
    income *= entry.coef;
  }
  return income;
}

// ── シミュレーション ──────────────────────────────────────────────
function simulate(p) {
  const lm = p.houseLoan > 0
    ? (p.houseLoan * (p.loanRate/100/12) * Math.pow(1+p.loanRate/100/12, p.loanYears*12)) /
      (Math.pow(1+p.loanRate/100/12, p.loanYears*12) - 1) : 0;
  const loanAnnual = lm * 12;
  const annualLiving = p.food + p.daily + p.utility + p.comm + p.transport + p.leisure + p.clothing + p.medical + p.other;

  let cash = p.myCash + (p.hasSpouse ? p.spouseCash : 0);
  let myNisa = p.myNisaBalance, spouseNisa = p.spouseNisaBalance || 0;
  let myStock = 0, spouseStock = 0, kid1 = 0, kid2 = 0;
  const rows = [];

  for (let age = p.myAge; age <= p.lifeExpectancy; age++) {
    const yr = age - p.myAge;
    const cy = BASE_YEAR + yr;
    const myRetired = age >= p.myRetireAge;
    const spouseRetired = p.hasSpouse && (p.spouseAge + yr) >= p.spouseRetireAge;
    const bothRetired = myRetired && (!p.hasSpouse || spouseRetired);

    // 収入（変動係数 or 上昇率）
    const myBaseInc = p.useIncomeCoef
      ? applyCoef(p.myTakeHome, p.myAge, Math.min(age, 70))
      : p.myTakeHome * Math.pow(1 + p.myIncomeGrowth/100, Math.min(yr, Math.max(0, 55 - p.myAge)));
    const myInc = myRetired ? p.myPension : myBaseInc;
    const inAdj = p.hasSpouse && p.spouseAdjEnabled && cy >= p.spouseAdjStart && cy <= p.spouseAdjEnd;
    const spouseBaseRaw = p.hasSpouse ? (p.useIncomeCoef
      ? applyCoef(p.spouseTakeHome, p.spouseAge, Math.min(p.spouseAge + yr, 70))
      : p.spouseTakeHome * Math.pow(1 + p.spouseIncomeGrowth/100, Math.min(yr, Math.max(0, 55 - p.spouseAge))))
      : 0;
    const spouseBaseInc = inAdj ? spouseBaseRaw * (p.spouseAdjRatio/100) : spouseBaseRaw;
    const spouseInc = !p.hasSpouse ? 0 : spouseRetired ? p.spousePension : spouseBaseInc;
    const income = myInc + spouseInc;

    const myBonus = age === p.myRetireAge ? p.myRetireBonus : 0;
    const spouseBonus = p.hasSpouse && (p.spouseAge+yr) === p.spouseRetireAge ? p.spouseRetireBonus : 0;

    // 住宅（複数物件）
    const houses = p.houses || [];
    const boughtAny = houses.some(h => yr >= h.year && (h.cashPrice > 0 || h.loan > 0));

    // 家賃（賃貸の場合 & segments対応）
    let rentY = 0;
    if (p.housingType === "rent" && !boughtAny) {
      const segs = p.rentSegments || [{ amount: 120 }];
      let matched = segs[segs.length - 1]; // デフォルトは最後のセグメント
      for (let k = 0; k < segs.length - 1; k++) {
        if (segs[k].endYear && cy <= segs[k].endYear) { matched = segs[k]; break; }
      }
      rentY = matched.amount || 0;
    }

    let cashBuy = 0, loanCost = 0;
    houses.forEach(h => {
      if (h.cashPrice > 0 && yr === h.year) cashBuy += h.cashPrice;
      const lm = h.loan > 0 ? (h.loan*(h.loanRate/100/12)*Math.pow(1+h.loanRate/100/12,h.loanYears*12))/(Math.pow(1+h.loanRate/100/12,h.loanYears*12)-1) : 0;
      if (yr >= h.year && yr < h.year + h.loanYears && h.loan > 0) loanCost += lm * 12;
    });

    // 固定資産税（持ち家 or 住宅購入後）
    const ownedHouseYear = houses.length > 0 ? houses[0].year : null;
    const isOwned = p.housingType === "own" || (ownedHouseYear !== null && yr >= ownedHouseYear);
    const firstHousePrice = houses.length > 0 ? (houses[0].cashPrice + houses[0].loan) : p.propertyInitialValue || 0;
    const propTax = isOwned && p.propertyTaxEnabled && firstHousePrice > 0
      ? Math.round(firstHousePrice * (p.propertyTaxRate / 100) * Math.max(0.1, 1 - (yr - (ownedHouseYear||0)) * 0.02))
      : 0;

    // 不動産評価額（購入価格から年率減価）
    const propVal = isOwned && firstHousePrice > 0
      ? Math.round(firstHousePrice * Math.pow(1 - (p.propertyDepreciationRate||1.5)/100, Math.max(0, yr - (ownedHouseYear||0))))
      : 0;

    // 教育費
    const ed = ca0 => { const ca=ca0+yr; if(ca>=0&&ca<3) return p.eduNursery; if(ca>=3&&ca<6) return p.eduNursery*0.5; if(ca>=6&&ca<12) return p.eduElementary; if(ca>=12&&ca<15) return p.eduJunior; if(ca>=15&&ca<18) return p.eduHigh; if(ca>=18&&ca<22) return p.eduCollege; return 0; };
    const eduCost = (p.child1Age>=0?ed(p.child1Age):0) + (p.child2Age>=0?ed(p.child2Age):0);

    // 投資（3期間）
    const p3 = k => per3===1?p[k+'1']||0:per3===2?p[k+'2']||0:p[k+'3']||0;
    const myNisaC = !bothRetired && cy>=p.myNisaStart && cy<=p.myNisaEnd ? p3('myNisaAnnual') : 0;
    const spouseNisaC = p.hasSpouse && !bothRetired && cy>=p.spouseNisaStart && cy<=p.spouseNisaEnd ? p3('spouseNisaAnnual') : 0;
    const myStockC = !bothRetired && cy>=p.myStockStart && cy<=p.myStockEnd ? p3('myStockAnnual') : 0;
    const spouseStockC = p.hasSpouse && !bothRetired && cy>=p.spouseStockStart && cy<=p.spouseStockEnd ? p3('spouseStockAnnual') : 0;
    const investTotal = myNisaC + spouseNisaC + myStockC + spouseStockC;

    const eventCost = p.events.filter(ev=>ev.year===yr).reduce((s,ev)=>s+ev.amount,0);
    const totalCost = annualLiving + rentY + loanCost + propTax + eduCost + p.insurance + investTotal;
    const cashFlow = income - totalCost;

    myNisa = myNisa*(1+p.myNisaReturn/100)+myNisaC;
    spouseNisa = spouseNisa*(1+p.spouseNisaReturn/100)+spouseNisaC;
    myStock = myStock*(1+p.myStockReturn/100)+myStockC;
    spouseStock = spouseStock*(1+p.spouseStockReturn/100)+spouseStockC;

    const k1c = p.kid1NisaAnnual>0&&cy>=p.kid1NisaStart&&cy<=p.kid1NisaEnd?p.kid1NisaAnnual:0;
    const k2c = p.kid2NisaAnnual>0&&cy>=p.kid2NisaStart&&cy<=p.kid2NisaEnd?p.kid2NisaAnnual:0;
    kid1 = kid1*(1+p.kidNisaReturn/100)+k1c;
    kid2 = kid2*(1+p.kidNisaReturn/100)+k2c;
    if(cy===p.kid1NisaWithdraw&&kid1>0){cash+=kid1;kid1=0;}
    if(cy===p.kid2NisaWithdraw&&kid2>0){cash+=kid2;kid2=0;}

    cash = cash*(1+p.cashReturn/100)+cashFlow+myBonus+spouseBonus-cashBuy-eventCost-k1c-k2c;

    // 投資取崩し（住宅購入時）
    houses.forEach(h => {
      if (h.investWithdraw > 0 && yr === h.year) {
        const w = h.investWithdraw;
        if (h.investSource === "nisa") { const av=myNisa+spouseNisa; const tk=Math.min(w,av); const r=av>0?tk/av:0; myNisa=Math.max(0,myNisa*(1-r)); spouseNisa=Math.max(0,spouseNisa*(1-r)); cash+=tk; }
        else if (h.investSource === "stock") { const av=myStock+spouseStock; const tk=Math.min(w,av); const r=av>0?tk/av:0; myStock=Math.max(0,myStock*(1-r)); spouseStock=Math.max(0,spouseStock*(1-r)); cash+=tk; }
        else { const na=myNisa+spouseNisa; const tn=Math.min(w,na); const rn=na>0?tn/na:0; myNisa=Math.max(0,myNisa*(1-rn)); spouseNisa=Math.max(0,spouseNisa*(1-rn)); const rem=w-tn; const sa=myStock+spouseStock; const ts=Math.min(rem,sa); const rs=sa>0?ts/sa:0; myStock=Math.max(0,myStock*(1-rs)); spouseStock=Math.max(0,spouseStock*(1-rs)); cash+=tn+ts; }
      }
    });

    rows.push({
      age, year: cy, income: Math.round(income), cashFlow: Math.round(cashFlow),
      livingCost: Math.round(annualLiving+rentY+loanCost+p.insurance),
      eduCost: Math.round(eduCost), invest: Math.round(investTotal),
      eventCost: Math.round(eventCost),
      cashAsset: Math.round(cash), myNisaAsset: Math.round(myNisa),
      spouseNisaAsset: Math.round(spouseNisa), myStockAsset: Math.round(myStock),
      spouseStockAsset: Math.round(spouseStock),
      kid1NisaAsset: Math.round(kid1), kid2NisaAsset: Math.round(kid2),
      propTax: Math.round(propTax),
      propVal: Math.round(propVal),
      total: Math.round(cash+myNisa+spouseNisa+myStock+spouseStock+kid1+kid2+propVal),
    });
  }
  const firstLoan = (p.houses||[]).find(h=>h.loan>0);
  const firstLm = firstLoan ? (firstLoan.loan*(firstLoan.loanRate/100/12)*Math.pow(1+firstLoan.loanRate/100/12,firstLoan.loanYears*12))/(Math.pow(1+firstLoan.loanRate/100/12,firstLoan.loanYears*12)-1) : 0;
  return { data: rows, loanMonthly: Math.round(firstLm) };
}

// ── ウィザードのステップ定義 ──────────────────────────────────────
const STEPS = [
  { id: 1, icon: "👤", label: "プロフィール" },
  { id: 2, icon: "💸", label: "収支" },
  { id: 3, icon: "📈", label: "投資" },
  { id: 4, icon: "🏠", label: "不動産" },
  { id: 5, icon: "🎯", label: "イベント" },
  { id: 6, icon: "📊", label: "結果" },
];

// ── メインコンポーネント ──────────────────────────────────────────
export default function LifePlanPro() {
  const [p, setP] = useState(() => {
    try {
      const hash = window.location.hash.slice(1);
      if (hash) return { ...DEFAULTS, ...JSON.parse(decodeURIComponent(escape(atob(hash)))) };
      const saved = localStorage.getItem("lifeplan_pro_v3");
      if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    } catch(e) {}
    return { ...DEFAULTS };
  });
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(null);

  const set = k => v => setP(prev => ({ ...prev, [k]: v }));
  const setP3 = (prefix, i, v) => setP(prev => ({ ...prev, [`${prefix}${i+1}`]: v }));

  const saveData = () => {
    try { localStorage.setItem("lifeplan_pro_v3", JSON.stringify(p)); setSaved("saved"); setTimeout(()=>setSaved(null),2500); } catch(e){}
  };
  const shareLink = () => {
    try {
      const url = location.href.split("#")[0]+"#"+btoa(unescape(encodeURIComponent(JSON.stringify(p))));
      navigator.clipboard?.writeText(url);
      setSaved("shared"); setTimeout(()=>setSaved(null),2500);
    } catch(e){}
  };
  const exportCSV = (data) => {
    const h = ["西暦","本人歳","収入","年間収支","生活費","総資産"];
    const rows = data.map(d=>[d.year,d.age,d.income,d.cashFlow,d.livingCost,d.total]);
    const csv = [h,...rows].map(r=>r.join(",")).join("\n");
    const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("\uFEFF"+csv); a.download="lifeplan.csv"; a.click();
  };

  const { data, loanMonthly } = useMemo(() => simulate(p), [p]);
  const finalTotal = data[data.length-1]?.total ?? 0;
  const crossZeroAge = data.find(d=>d.total<0)?.age;
  const peakTotal = Math.max(0, ...data.map(d=>d.total));
  const retireData = data.find(d=>d.age===p.myRetireAge);
  const minusYears = data.filter(d=>d.cashFlow<0&&d.age<p.myRetireAge);

  const DualTick = ({ x, y, payload }) => (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" fill={C.muted} fontSize={9}>{payload.value}歳</text>
      <text x={0} y={0} dy={22} textAnchor="middle" fill="#94A3B8" fontSize={8}>{BASE_YEAR+payload.value-p.myAge}</text>
    </g>
  );
  const xAx = { dataKey:"age", interval:9, tickLine:false, height:34, tick:DualTick };

  const goNext = () => setStep(s => Math.min(6, s+1));
  const goPrev = () => setStep(s => Math.max(1, s-1));

  // ステップ完了判定
  const stepOk = {
    1: p.myAge > 0 && p.myTakeHome > 0,
    2: true,
    3: true,
    4: true,
    5: true,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "-apple-system,sans-serif" }}>
      {/* ヘッダー */}
      <div style={{ background: C.dark, padding: "12px 16px 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>ライフプランPro</div>
              <div style={{ fontSize: 10, color: "#64748B" }}>v3.0</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveData} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>💾 保存</button>
              <button onClick={shareLink} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#0369A1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🔗 共有</button>
            </div>
          </div>
          {saved && (
            <div style={{ background: saved==="saved"?"#065F46":"#1E3A5F", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#fff", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
              {saved==="saved"?"✅ 保存しました":"✅ リンクをコピーしました"}
            </div>
          )}
          {/* ステップインジケーター */}
          <div style={{ display: "flex", gap: 0 }}>
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => setStep(s.id)}
                style={{ flex: 1, padding: "8px 2px", border: "none", cursor: "pointer", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, borderBottom: step===s.id ? `3px solid ${C.accent}` : "3px solid transparent" }}>
                <span style={{ fontSize: 14 }}>{s.icon}</span>
                <span style={{ fontSize: 8, color: step===s.id ? "#93C5FD" : "#475569", fontWeight: step===s.id ? 700 : 400 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* コンテンツ */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 14px 100px" }}>

        {/* ══ STEP 1: プロフィール ══════════════════════════════════ */}
        {step === 1 && (<>
          <div style={{ background: "linear-gradient(135deg,#1E40AF,#3B82F6)", borderRadius: 16, padding: "20px", marginBottom: 16, color: "#fff" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>👤 基本情報を入力</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>あなたのライフプランに合わせてシミュレーションします</div>
          </div>

          <Card color={`${C.accent}40`}>
            <SH title="本人" icon="🧑" color={C.accent} />
            <Row label="現在の年齢"><Num value={p.myAge} onChange={set("myAge")} min={20} max={70} unit="歳" /></Row>
            <Row label="手取り年収"><Num value={p.myTakeHome} onChange={set("myTakeHome")} min={0} max={3000} step={10} unit="万円" width={80} /></Row>
            <Row label="収入変動係数を使う" sub="FP標準値（年齢帯別）を自動適用">
              <Toggle value={p.useIncomeCoef} onChange={set("useIncomeCoef")} color={C.green} />
            </Row>
            {!p.useIncomeCoef && <Row label="収入の年上昇率"><Num value={p.myIncomeGrowth} onChange={set("myIncomeGrowth")} min={0} max={5} step={0.1} unit="%" /></Row>}
            <Row label="退職予定年齢"><Num value={p.myRetireAge} onChange={set("myRetireAge")} min={50} max={75} unit="歳" /></Row>
            <Row label="想定年金（年額）"><Num value={p.myPension} onChange={set("myPension")} min={0} max={400} step={5} unit="万円" width={80} /></Row>
            <Row label="退職金"><Num value={p.myRetireBonus} onChange={set("myRetireBonus")} min={0} max={5000} step={100} unit="万円" width={80} /></Row>
            <Row label="現在の現金・預金"><Num value={p.myCash} onChange={set("myCash")} min={0} max={9999} step={10} unit="万円" width={80} /></Row>
            <Row label="現在のNISA残高"><Num value={p.myNisaBalance} onChange={set("myNisaBalance")} min={0} max={9999} step={10} unit="万円" width={80} /></Row>
          </Card>

          <Card>
            <SH title="配偶者" icon="💑" color={C.purple} />
            <Row label="配偶者あり"><Toggle value={p.hasSpouse} onChange={set("hasSpouse")} color={C.purple} /></Row>
            {p.hasSpouse && (<>
              <Row label="配偶者の年齢"><Num value={p.spouseAge} onChange={set("spouseAge")} min={20} max={70} unit="歳" color={C.purple} /></Row>
              <Row label="配偶者の手取り年収"><Num value={p.spouseTakeHome} onChange={set("spouseTakeHome")} min={0} max={2000} step={10} unit="万円" width={80} color={C.purple} /></Row>
              {!p.useIncomeCoef && <Row label="収入の年上昇率"><Num value={p.spouseIncomeGrowth} onChange={set("spouseIncomeGrowth")} min={0} max={5} step={0.1} unit="%" color={C.purple} /></Row>}
              <Row label="配偶者の退職予定年齢"><Num value={p.spouseRetireAge} onChange={set("spouseRetireAge")} min={50} max={75} unit="歳" color={C.purple} /></Row>
              <Row label="配偶者の想定年金（年額）"><Num value={p.spousePension} onChange={set("spousePension")} min={0} max={300} step={5} unit="万円" width={80} color={C.purple} /></Row>
              <Row label="配偶者の退職金"><Num value={p.spouseRetireBonus} onChange={set("spouseRetireBonus")} min={0} max={5000} step={100} unit="万円" width={80} color={C.purple} /></Row>
              <Row label="配偶者の現在の現金・預金"><Num value={p.spouseCash} onChange={set("spouseCash")} min={0} max={9999} step={10} unit="万円" width={80} color={C.purple} /></Row>
              <Row label="配偶者の現在のNISA残高"><Num value={p.spouseNisaBalance} onChange={set("spouseNisaBalance")} min={0} max={9999} step={10} unit="万円" width={80} color={C.purple} /></Row>
              <SH title="収入調整期間（育休・時短等）" icon="⏸️" color={C.orange} />
              <Row label="設定する"><Toggle value={p.spouseAdjEnabled} onChange={set("spouseAdjEnabled")} color={C.orange} /></Row>
              {p.spouseAdjEnabled && (<>
                <Row label="開始年"><Num value={p.spouseAdjStart} onChange={set("spouseAdjStart")} min={BASE_YEAR} max={2060} unit="年" color={C.orange} /></Row>
                <Row label="終了年"><Num value={p.spouseAdjEnd} onChange={set("spouseAdjEnd")} min={BASE_YEAR} max={2060} unit="年" color={C.orange} /></Row>
                <Row label="収入割合（0%=育休）"><Num value={p.spouseAdjRatio} onChange={set("spouseAdjRatio")} min={0} max={100} step={5} unit="%" color={C.orange} /></Row>
                <div style={{ background: "#FFF7ED", borderRadius: 8, padding: "8px 10px", margin: "6px 0", fontSize: 11, color: "#92400E" }}>
                  {p.spouseAdjStart}〜{p.spouseAdjEnd}年: 約{Math.round(p.spouseTakeHome*p.spouseAdjRatio/100)}万円/年
                </div>
              </>)}
            </>)}
          </Card>

          <Card>
            <SH title="子ども" icon="👶" color={C.yellow} />
            <Row label="子どもの人数">
              <div style={{ display: "flex", gap: 8 }}>
                {[0,1,2].map(n => <Chip key={n} label={n===0?"なし":`${n}人`} selected={p.childCount===n} onClick={()=>setP(prev=>({...prev, childCount:n, child1Age:n>=1?prev.child1Age<0?0:prev.child1Age:-1, child2Age:n>=2?prev.child2Age<0?0:prev.child2Age:-1}))} />)}
              </div>
            </Row>
            {p.childCount >= 1 && <Row label="第1子の現在年齢"><Num value={p.child1Age} onChange={set("child1Age")} min={0} max={18} unit="歳" color={C.yellow} /></Row>}
            {p.childCount >= 2 && <Row label="第2子の現在年齢"><Num value={p.child2Age} onChange={set("child2Age")} min={0} max={18} unit="歳" color={C.yellow} /></Row>}
            <Row label="想定寿命"><Num value={p.lifeExpectancy} onChange={set("lifeExpectancy")} min={75} max={100} unit="歳" /></Row>
          </Card>
        </>)}

        {/* ══ STEP 2: 収支 ══════════════════════════════════════════ */}
        {step === 2 && (<>
          <div style={{ background: "linear-gradient(135deg,#065F46,#10B981)", borderRadius: 16, padding: "20px", marginBottom: 16, color: "#fff" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>💸 毎月の収支</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>年額で入力してください（月額×12でOK）</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 12 }}>年間支出合計: <span style={{ color: "#FDE68A" }}>{Math.round(p.food+p.daily+p.utility+p.comm+p.transport+p.leisure+p.insurance+p.clothing+p.medical+p.other).toLocaleString()}万円</span></div>
          </div>

          {/* 住宅タイプ選択 */}
          <Card color={`${C.accent}40`}>
            <SH title="住まいのタイプ" icon="🏠" color={C.accent} />
            <div style={{ display: "flex", gap: 10, paddingTop: 8, paddingBottom: 4 }}>
              {[["rent","🏢 賃貸"],["own","🏡 持ち家（既に保有）"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("housingType")(v)}
                  style={{ flex:1, padding:"12px 8px", borderRadius:12, border:`2px solid ${p.housingType===v?C.accent:C.border}`, background:p.housingType===v?C.accent:"#fff", color:p.housingType===v?"#fff":C.muted, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, paddingBottom: 4 }}>
              {p.housingType==="rent" ? "賃貸の方は下で家賃を設定してください。住宅購入予定はSTEP4で入力します。" : "現在の持ち家情報をSTEP4で入力してください。"}
            </div>
          </Card>

          {/* 家賃セグメント（賃貸のみ表示） */}
          {p.housingType === "rent" && (() => {
            const segs = p.rentSegments || [{ amount: 120 }];
            const updateSeg = (i, k, v) => setP(prev => {
              const s = [...(prev.rentSegments||[])]; s[i] = { ...s[i], [k]: v }; return { ...prev, rentSegments: s };
            });
            const addSeg = () => {
              const lastEnd = segs[segs.length-2]?.endYear || BASE_YEAR + 4;
              setP(prev => {
                const s = [...(prev.rentSegments||[])];
                s.splice(s.length-1, 0, { endYear: lastEnd + 5, amount: s[s.length-1]?.amount || 120 });
                return { ...prev, rentSegments: s };
              });
            };
            const removeSeg = i => setP(prev => {
              const s = (prev.rentSegments||[]).filter((_,j)=>j!==i);
              return { ...prev, rentSegments: s.length ? s : [{ amount: 120 }] };
            });
            return (
              <Card color={`${C.green}40`}>
                <SH title="家賃（期間別・年額）" icon="💴" color={C.green} />
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>「＋期間を追加」で家賃変動を設定できます</div>
                {segs.map((seg, i) => {
                  const isLast = i === segs.length - 1;
                  const prevEnd = i === 0 ? BASE_YEAR - 1 : (segs[i-1].endYear || BASE_YEAR);
                  const label = isLast
                    ? `${(segs[i-1]?.endYear ? segs[i-1].endYear + 1 : BASE_YEAR)}年〜`
                    : `${prevEnd + 1}〜${seg.endYear}年`;
                  return (
                    <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>期間{i+1}: {label}</span>
                        {segs.length > 1 && (
                          <button onClick={()=>removeSeg(i)} style={{ background:"#FEF2F2",border:"none",borderRadius:6,padding:"3px 8px",color:C.red,cursor:"pointer",fontSize:11 }}>削除</button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        {!isLast && (
                          <div>
                            <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>この期間の終わり</div>
                            <Num value={seg.endYear||BASE_YEAR+4} onChange={v=>updateSeg(i,"endYear",v)} min={BASE_YEAR} max={2060} unit="年まで" color={C.green} width={64} />
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>家賃（年額）</div>
                          <Num value={seg.amount||0} onChange={v=>updateSeg(i,"amount",v)} min={0} max={360} step={6} unit="万円" color={C.green} width={72} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button onClick={addSeg} style={{ width:"100%", padding:"10px", borderRadius:10, border:`2px dashed ${C.green}`, background:"#F0FDF4", color:C.green, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  ＋ 期間を追加（家賃変動）
                </button>
              </Card>
            );
          })()}

          <Card>
            <SH title="食費・日用品・光熱費" icon="🛒" color={C.green} />
            <Row label="食費（年額）"><Num value={p.food} onChange={set("food")} min={0} max={240} step={6} unit="万円" width={80} /></Row>
            <Row label="日用品（年額）"><Num value={p.daily} onChange={set("daily")} min={0} max={60} step={1} unit="万円" width={80} /></Row>
            <Row label="光熱費（年額）"><Num value={p.utility} onChange={set("utility")} min={0} max={60} step={1} unit="万円" width={80} /></Row>
            <SH title="通信・交通・レジャー" icon="🚃" color={C.yellow} />
            <Row label="通信費（年額）"><Num value={p.comm} onChange={set("comm")} min={0} max={30} step={1} unit="万円" width={80} /></Row>
            <Row label="交通費（年額）"><Num value={p.transport} onChange={set("transport")} min={0} max={60} step={1} unit="万円" width={80} /></Row>
            <Row label="レジャー費（年額）"><Num value={p.leisure} onChange={set("leisure")} min={0} max={120} step={5} unit="万円" width={80} /></Row>
            <SH title="保険・医療・その他" icon="🏥" color={C.red} />
            <Row label="保険料（年額）"><Num value={p.insurance} onChange={set("insurance")} min={0} max={150} step={1} unit="万円" width={80} /></Row>
            <Row label="被服費（年額）"><Num value={p.clothing} onChange={set("clothing")} min={0} max={60} step={1} unit="万円" width={80} /></Row>
            <Row label="医療費（年額）"><Num value={p.medical} onChange={set("medical")} min={0} max={60} step={1} unit="万円" width={80} /></Row>
            <Row label="その他（年額）"><Num value={p.other} onChange={set("other")} min={0} max={100} step={1} unit="万円" width={80} /></Row>
          </Card>

          {p.childCount > 0 && (
            <Card color={`${C.yellow}40`}>
              <SH title="教育費（年額・1人あたり）" icon="🎒" color={C.yellow} />
              <Row label="保育園（0〜5歳）"><Num value={p.eduNursery} onChange={set("eduNursery")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow} /></Row>
              <Row label="小学校（6〜11歳）"><Num value={p.eduElementary} onChange={set("eduElementary")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow} /></Row>
              <Row label="中学校（12〜14歳）"><Num value={p.eduJunior} onChange={set("eduJunior")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow} /></Row>
              <Row label="高校（15〜17歳）"><Num value={p.eduHigh} onChange={set("eduHigh")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow} /></Row>
              <Row label="大学（18〜21歳）"><Num value={p.eduCollege} onChange={set("eduCollege")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow} /></Row>
            </Card>
          )}
        </>)}

        {/* ══ STEP 3: 投資 ══════════════════════════════════════════ */}
        {step === 3 && (<>
          <div style={{ background: "linear-gradient(135deg,#1E3A5F,#3B82F6)", borderRadius: 16, padding: "20px", marginBottom: 16, color: "#fff" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>📈 投資・資産形成</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>期間別に積立額を設定できます</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 12 }}>
              月間投資額: <span style={{ color: "#FDE68A" }}>{Math.round((p.myNisaAnnual1+(p.hasSpouse?p.spouseNisaAnnual1:0)+p.myStockAnnual1+(p.hasSpouse?p.spouseStockAnnual1:0))/12)}万円</span>
            </div>
          </div>

          {/* 期間区切り：住宅変更と連動 or 手動 */}
          {(() => {
            const houseYears = (p.houses||[]).map(h=>BASE_YEAR+h.year).sort((a,b)=>a-b);
            if (houseYears.length > 0) {
              return (
                <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.accent}30` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>📅 投資期間の区切り（STEP4の住宅変更と連動）</div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {houseYears.map((y,i)=>`期間${i+1}: 〜${y-1}年`).join("　")}　期間{houseYears.length+1}: {houseYears[houseYears.length-1]}年〜
                  </div>
                </div>
              );
            }
            return (
              <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.accent}30` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 6 }}>📅 投資期間の区切り年（手動設定）</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>期間1の終わり</div>
                    <Num value={p.period1End} onChange={v => setP(prev => ({ ...prev, period1End: Math.min(v, prev.period2End - 1) }))} min={BASE_YEAR} max={2060} unit="年まで" color={C.accent} width={64} />
                  </div>
                  <div style={{ fontSize: 18, color: C.muted }}>→</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>期間2の終わり</div>
                    <Num value={p.period2End} onChange={v => setP(prev => ({ ...prev, period2End: Math.max(v, prev.period1End + 1) }))} min={BASE_YEAR+1} max={2065} unit="年まで" color={C.accent} width={64} />
                  </div>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
                  期間1: 〜{p.period1End}年　期間2: {p.period1End+1}〜{p.period2End}年　期間3: {p.period2End+1}年〜
                </div>
              </div>
            );
          })()}

          {/* 収支アドバイス */}
          {minusYears.length > 0 && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: `1px solid ${C.red}40`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 4 }}>⚠️ 収支マイナスが{minusYears.length}年間あります</div>
              <div style={{ fontSize: 11, color: C.text }}>最大赤字 {Math.abs(Math.min(...minusYears.map(d=>d.cashFlow))).toLocaleString()}万円/年。投資額の見直しを検討してください。</div>
            </div>
          )}

          <Card color={`${C.green}40`}>
            <SH title="本人 NISA（年額）" icon="📗" color={C.green} />
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>積立＋成長投資枠の合計</div>
            <Period3 values={[p.myNisaAnnual1,p.myNisaAnnual2,p.myNisaAnnual3]} onChange={(i,v)=>setP3("myNisaAnnual",i,v)} max={360} step={12} labels={(() => { const hy=(p.houses||[]).map(h=>BASE_YEAR+h.year).sort((a,b)=>a-b); return hy.length>=2?[`〜${hy[0]-1}`,`${hy[0]}〜${hy[1]-1}`,`${hy[1]}〜`]:hy.length===1?[`〜${hy[0]-1}`,`${hy[0]}〜`,`${hy[0]}〜`]:[`〜${p.period1End}`,`${p.period1End+1}〜${p.period2End}`,`${p.period2End+1}〜`];})()} />
            <Row label="開始年"><Num value={p.myNisaStart} onChange={set("myNisaStart")} min={2020} max={2060} unit="年" color={C.green} /></Row>
            <Row label="終了年"><Num value={p.myNisaEnd} onChange={set("myNisaEnd")} min={2025} max={2070} unit="年" color={C.green} /></Row>
            <Row label="想定利回り"><Num value={p.myNisaReturn} onChange={set("myNisaReturn")} min={0} max={12} step={0.1} unit="%" color={C.green} /></Row>
          </Card>

          {p.hasSpouse && (
            <Card color="#34D39940">
              <SH title="配偶者 NISA（年額）" icon="📗" color="#34D399" />
              <Period3 values={[p.spouseNisaAnnual1,p.spouseNisaAnnual2,p.spouseNisaAnnual3]} onChange={(i,v)=>setP3("spouseNisaAnnual",i,v)} max={360} step={12} labels={(() => { const hy=(p.houses||[]).map(h=>BASE_YEAR+h.year).sort((a,b)=>a-b); return hy.length>=2?[`〜${hy[0]-1}`,`${hy[0]}〜${hy[1]-1}`,`${hy[1]}〜`]:hy.length===1?[`〜${hy[0]-1}`,`${hy[0]}〜`,`${hy[0]}〜`]:[`〜${p.period1End}`,`${p.period1End+1}〜${p.period2End}`,`${p.period2End+1}〜`];})()} />
              <Row label="開始年"><Num value={p.spouseNisaStart} onChange={set("spouseNisaStart")} min={2020} max={2060} unit="年" color="#34D399" /></Row>
              <Row label="終了年"><Num value={p.spouseNisaEnd} onChange={set("spouseNisaEnd")} min={2025} max={2070} unit="年" color="#34D399" /></Row>
              <Row label="想定利回り"><Num value={p.spouseNisaReturn} onChange={set("spouseNisaReturn")} min={0} max={12} step={0.1} unit="%" color="#34D399" /></Row>
            </Card>
          )}

          <Card color={`${C.accent}40`}>
            <SH title="本人 証券口座（年額）" icon="📈" color={C.accent} />
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>NISA満額後の特定口座・ETF等</div>
            <Period3 values={[p.myStockAnnual1,p.myStockAnnual2,p.myStockAnnual3]} onChange={(i,v)=>setP3("myStockAnnual",i,v)} max={600} step={12} labels={(() => { const hy=(p.houses||[]).map(h=>BASE_YEAR+h.year).sort((a,b)=>a-b); return hy.length>=2?[`〜${hy[0]-1}`,`${hy[0]}〜${hy[1]-1}`,`${hy[1]}〜`]:hy.length===1?[`〜${hy[0]-1}`,`${hy[0]}〜`,`${hy[0]}〜`]:[`〜${p.period1End}`,`${p.period1End+1}〜${p.period2End}`,`${p.period2End+1}〜`];})()} />
            <Row label="開始年"><Num value={p.myStockStart} onChange={set("myStockStart")} min={2020} max={2060} unit="年" /></Row>
            <Row label="終了年"><Num value={p.myStockEnd} onChange={set("myStockEnd")} min={2025} max={2070} unit="年" /></Row>
            <Row label="想定利回り"><Num value={p.myStockReturn} onChange={set("myStockReturn")} min={0} max={15} step={0.1} unit="%" /></Row>
          </Card>

          {p.hasSpouse && (
            <Card color="#93C5FD40">
              <SH title="配偶者 証券口座（年額）" icon="📈" color="#93C5FD" />
              <Period3 values={[p.spouseStockAnnual1,p.spouseStockAnnual2,p.spouseStockAnnual3]} onChange={(i,v)=>setP3("spouseStockAnnual",i,v)} max={600} step={12} labels={(() => { const hy=(p.houses||[]).map(h=>BASE_YEAR+h.year).sort((a,b)=>a-b); return hy.length>=2?[`〜${hy[0]-1}`,`${hy[0]}〜${hy[1]-1}`,`${hy[1]}〜`]:hy.length===1?[`〜${hy[0]-1}`,`${hy[0]}〜`,`${hy[0]}〜`]:[`〜${p.period1End}`,`${p.period1End+1}〜${p.period2End}`,`${p.period2End+1}〜`];})()} />
              <Row label="開始年"><Num value={p.spouseStockStart} onChange={set("spouseStockStart")} min={2020} max={2060} unit="年" color="#93C5FD" /></Row>
              <Row label="終了年"><Num value={p.spouseStockEnd} onChange={set("spouseStockEnd")} min={2025} max={2070} unit="年" color="#93C5FD" /></Row>
              <Row label="想定利回り"><Num value={p.spouseStockReturn} onChange={set("spouseStockReturn")} min={0} max={15} step={0.1} unit="%" color="#93C5FD" /></Row>
            </Card>
          )}

          <Card>
            <SH title="現金・預金" icon="🏦" color={C.muted} />
            <Row label="現金利回り（定期等）"><Num value={p.cashReturn} onChange={set("cashReturn")} min={0} max={3} step={0.1} unit="%" /></Row>
          </Card>

          {p.childCount > 0 && (
            <Card color={`${C.yellow}40`}>
              <SH title="こどもNISA（上限60万/年・1人）" icon="👶" color={C.yellow} />
              <Row label="共通利回り"><Num value={p.kidNisaReturn} onChange={set("kidNisaReturn")} min={0} max={12} step={0.1} unit="%" color={C.yellow} /></Row>
              {p.childCount >= 1 && (
                <div style={{ background: "#FFFBEB", borderRadius: 10, padding: "10px", marginTop: 8, border: `1px solid ${C.yellow}40` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>👦 第1子</div>
                  <Row label="年額（上限60万）"><Num value={p.kid1NisaAnnual} onChange={set("kid1NisaAnnual")} min={0} max={60} step={1} unit="万円" width={72} color={C.yellow} /></Row>
                  <Row label="積立終了年"><Num value={p.kid1NisaEnd} onChange={set("kid1NisaEnd")} min={2025} max={2060} unit="年" color={C.yellow} /></Row>
                  <Row label="取崩し年（大学入学）"><Num value={p.kid1NisaWithdraw} onChange={set("kid1NisaWithdraw")} min={2025} max={2070} unit="年" color={C.yellow} /></Row>
                </div>
              )}
              {p.childCount >= 2 && (
                <div style={{ background: "#FEF9C3", borderRadius: 10, padding: "10px", marginTop: 8, border: `1px solid ${C.yellow}40` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#713F12", marginBottom: 4 }}>👧 第2子</div>
                  <Row label="年額（上限60万）"><Num value={p.kid2NisaAnnual} onChange={set("kid2NisaAnnual")} min={0} max={60} step={1} unit="万円" width={72} color={C.yellow} /></Row>
                  <Row label="積立終了年"><Num value={p.kid2NisaEnd} onChange={set("kid2NisaEnd")} min={2025} max={2060} unit="年" color={C.yellow} /></Row>
                  <Row label="取崩し年（大学入学）"><Num value={p.kid2NisaWithdraw} onChange={set("kid2NisaWithdraw")} min={2025} max={2070} unit="年" color={C.yellow} /></Row>
                </div>
              )}
            </Card>
          )}
        </>)}

        {/* ══ STEP 4: 不動産 ════════════════════════════════════════ */}
        {step === 4 && (() => {
          const houses = p.houses || [];
          const updateHouse = (i, k, v) => setP(prev => {
            const hs = [...(prev.houses||[])]; hs[i] = { ...hs[i], [k]: v }; return { ...prev, houses: hs };
          });
          const addHouse = () => setP(prev => ({ ...prev, houseCount: (prev.houseCount||0)+1, houses: [...(prev.houses||[]), { year: 5, cashPrice: 0, loan: 0, loanRate: 1.5, loanYears: 35, investWithdraw: 0, investSource: "nisa" }] }));
          const removeHouse = i => setP(prev => ({ ...prev, houseCount: (prev.houseCount||0)-1, houses: (prev.houses||[]).filter((_,j)=>j!==i) }));
          const houseColors = [C.yellow, C.orange, "#EF4444"];
          return (<>
            <div style={{ background: "linear-gradient(135deg,#78350F,#F59E0B)", borderRadius: 16, padding: "20px", marginBottom: 16, color: "#fff" }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>🏠 不動産・住宅購入</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>購入・買替えの予定を回数分入力できます</div>
            </div>

            <Card>
              <SH title="住宅変更の回数" icon="🏡" color={C.yellow} />
              <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
                {[0,1,2,3].map(n => (
                  <button key={n} onClick={() => {
                    const cur = p.houses||[];
                    const next = n > cur.length
                      ? [...cur, ...Array(n-cur.length).fill(null).map((_,i)=>({ year: 5+(i+cur.length)*10, cashPrice: 0, loan: 0, loanRate: 1.5, loanYears: 35, investWithdraw: 0, investSource: "nisa" }))]
                      : cur.slice(0, n);
                    setP(prev => ({ ...prev, houseCount: n, houses: next }));
                  }}
                    style={{ flex:1, padding:"10px 4px", borderRadius:10, border:`2px solid ${(p.houseCount||0)===n?C.yellow:C.border}`, background:(p.houseCount||0)===n?C.yellow:"#fff", color:(p.houseCount||0)===n?"#fff":C.muted, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    {n===0?"なし":`${n}回`}
                  </button>
                ))}
              </div>
            </Card>

            {/* 既に持ち家の場合の物件情報 */}
            {p.housingType === "own" && houses.length === 0 && (
              <Card color={`${C.yellow}40`} mb={12}>
                <SH title="現在の持ち家情報" icon="🏡" color={C.yellow} />
                <Row label="購入価格（万円）"><Num value={p.propertyInitialValue||0} onChange={set("propertyInitialValue")} min={0} max={20000} step={100} unit="万円" width={80} color={C.yellow} /></Row>
                <Row label="建築年"><Num value={p.propertyBuildYear||BASE_YEAR} onChange={set("propertyBuildYear")} min={1970} max={BASE_YEAR} unit="年" color={C.yellow} /></Row>
                <Row label="年間減価率" sub="木造:約2% / RC:約1%"><Num value={p.propertyDepreciationRate||1.5} onChange={set("propertyDepreciationRate")} min={0.5} max={5} step={0.1} unit="%" color={C.yellow} /></Row>
                <SH title="固定資産税" icon="📋" color={C.orange} />
                <Row label="固定資産税を計算する"><Toggle value={p.propertyTaxEnabled} onChange={set("propertyTaxEnabled")} color={C.orange} /></Row>
                {p.propertyTaxEnabled && (
                  <Row label="実効税率" sub="一般的に購入価格の0.1〜0.2%程度"><Num value={p.propertyTaxRate||0.14} onChange={set("propertyTaxRate")} min={0.05} max={0.5} step={0.01} unit="%" color={C.orange} /></Row>
                )}
                {p.propertyInitialValue > 0 && p.propertyTaxEnabled && (
                  <div style={{ background:"#FFF7ED", borderRadius:8, padding:"8px 10px", marginTop:6, fontSize:11, color:"#92400E" }}>
                    初年度の固定資産税目安: 約{Math.round(p.propertyInitialValue*(p.propertyTaxRate/100)).toLocaleString()}万円/年
                  </div>
                )}
              </Card>
            )}

            {houses.map((h, i) => {
              const lm = h.loan > 0 ? (h.loan*(h.loanRate/100/12)*Math.pow(1+h.loanRate/100/12,h.loanYears*12))/(Math.pow(1+h.loanRate/100/12,h.loanYears*12)-1) : 0;
              const col = houseColors[i] || C.yellow;
              return (
                <Card key={i} color={`${col}50`}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:14 }}>
                    <span style={{ fontSize:13, fontWeight:800, color:col }}>{i===0?"🏠 第1回目の購入":i===1?"🏠 第2回目（買替え）":"🏠 第3回目（買替え）"}</span>
                    <button onClick={()=>removeHouse(i)} style={{ background:"#FEF2F2",border:"none",borderRadius:6,padding:"4px 8px",color:C.red,cursor:"pointer",fontSize:11 }}>削除</button>
                  </div>
                  <Row label="購入時期"><Num value={h.year} onChange={v=>updateHouse(i,"year",v)} min={0} max={40} unit="年後" color={col} /></Row>
                  <Row label="現金購入額" sub="0=現金購入なし"><Num value={h.cashPrice} onChange={v=>updateHouse(i,"cashPrice",v)} min={0} max={20000} step={100} unit="万円" width={80} color={col} /></Row>
                  <Row label="ローン借入額" sub="0=ローンなし"><Num value={h.loan} onChange={v=>updateHouse(i,"loan",v)} min={0} max={20000} step={100} unit="万円" width={80} /></Row>
                  {h.loan > 0 && (<>
                    <Row label="金利（年率）"><Num value={h.loanRate} onChange={v=>updateHouse(i,"loanRate",v)} min={0.1} max={5} step={0.1} unit="%" /></Row>
                    <Row label="返済期間"><Num value={h.loanYears} onChange={v=>updateHouse(i,"loanYears",v)} min={10} max={35} unit="年" /></Row>
                    <div style={{ background:"#EFF6FF", borderRadius:8, padding:"8px 12px", marginTop:6, fontSize:12, color:C.accent, fontWeight:700 }}>
                      月々の返済: 約{Math.round(lm).toLocaleString()}万円
                    </div>
                  </>)}
                  {(h.cashPrice > 0 || h.loan > 0) && (<>
                    <SH title="投資資産からの取崩し" icon="📤" color={C.purple} />
                    <Row label="取崩し額"><Num value={h.investWithdraw} onChange={v=>updateHouse(i,"investWithdraw",v)} min={0} max={5000} step={50} unit="万円" width={80} color={C.purple} /></Row>
                    <Row label="取崩し元">
                      <div style={{ display:"flex", gap:6 }}>
                        {[["nisa","NISA"],["stock","証券"],["both","両方"]].map(([v,l])=>(
                          <button key={v} onClick={()=>updateHouse(i,"investSource",v)}
                            style={{ padding:"5px 10px", borderRadius:8, border:`2px solid ${h.investSource===v?C.purple:C.border}`, background:h.investSource===v?C.purple:"#fff", color:h.investSource===v?"#fff":C.muted, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </Row>
                    <SH title="固定資産税・不動産評価額" icon="📋" color={C.orange} />
                    <Row label="固定資産税を計算する"><Toggle value={p.propertyTaxEnabled} onChange={set("propertyTaxEnabled")} color={C.orange} /></Row>
                    {p.propertyTaxEnabled && (
                      <Row label="実効税率" sub="一般的に購入価格の0.1〜0.2%程度"><Num value={p.propertyTaxRate||0.14} onChange={set("propertyTaxRate")} min={0.05} max={0.5} step={0.01} unit="%" color={C.orange} /></Row>
                    )}
                    <Row label="年間減価率" sub="木造:約2% / RC:約1%"><Num value={p.propertyDepreciationRate||1.5} onChange={set("propertyDepreciationRate")} min={0.5} max={5} step={0.1} unit="%" color={C.orange} /></Row>
                    {(h.cashPrice+h.loan) > 0 && p.propertyTaxEnabled && (
                      <div style={{ background:"#FFF7ED", borderRadius:8, padding:"8px 10px", marginTop:6, fontSize:11, color:"#92400E" }}>
                        初年度の固定資産税目安: 約{Math.round((h.cashPrice+h.loan)*(p.propertyTaxRate/100)).toLocaleString()}万円/年
                      </div>
                    )}
                  </>)}
                </Card>
              );
            })}
          </>);
        })()}

        {/* ══ STEP 5: ライフイベント ════════════════════════════════ */}
        {step === 5 && (<>
          <div style={{ background: "linear-gradient(135deg,#4C1D95,#8B5CF6)", borderRadius: 16, padding: "20px", marginBottom: 16, color: "#fff" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>🎯 ライフイベント</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>車の買替えや旅行など大きな一時出費を登録します</div>
          </div>

          {/* イベント一覧（ID順で表示 ※並び替えはしない） */}
          {(p.events||[]).map(ev => (
            <div key={ev.id} style={{ background: C.panel, borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: `1px solid ${C.purple}30`, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{ev.icon}</span>
              <div style={{ flex: 1 }}>
                <input value={ev.name} onChange={e => setP(prev=>({...prev, events:prev.events.map(x=>x.id===ev.id?{...x,name:e.target.value}:x)}))}
                  style={{ fontSize:13, fontWeight:700, border:"none", borderBottom:`1.5px solid ${C.purple}`, background:"transparent", outline:"none", color:C.dark, width:"100%", marginBottom:6 }} />
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:10, color:C.muted }}>発生時期</div>
                    <Num value={ev.year} onChange={v=>setP(prev=>({...prev,events:prev.events.map(x=>x.id===ev.id?{...x,year:v}:x)}))} min={0} max={50} unit="年後" color={C.purple} width={52} />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted }}>金額</div>
                    <Num value={ev.amount} onChange={v=>setP(prev=>({...prev,events:prev.events.map(x=>x.id===ev.id?{...x,amount:v}:x)}))} min={0} max={5000} step={10} unit="万円" color={C.purple} width={64} />
                  </div>
                  <div style={{ marginTop:14 }}>
                    <div style={{ fontSize:10, color:C.muted }}>{p.myAge+ev.year}歳・{BASE_YEAR+ev.year}年</div>
                  </div>
                </div>
              </div>
              <button onClick={()=>setP(prev=>({...prev,events:prev.events.filter(e=>e.id!==ev.id)}))}
                style={{ background:"#FEF2F2",border:"none",borderRadius:8,padding:"6px 8px",color:C.red,cursor:"pointer",fontSize:18, flexShrink:0 }}>🗑</button>
            </div>
          ))}

          {(p.events||[]).length === 0 && (
            <div style={{ textAlign:"center", padding:"30px 20px", color:C.muted, fontSize:13 }}>まだイベントがありません</div>
          )}

          {/* カテゴリから追加 */}
          <div style={{ background: C.panel, borderRadius: 14, padding: "14px", border: `2px dashed ${C.purple}40` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 10 }}>＋ カテゴリから追加</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {[{icon:"🚗",name:"車の購入",amt:300},{icon:"🔧",name:"車の買替",amt:200},{icon:"✈️",name:"旅行",amt:50},{icon:"🛋️",name:"家具・家電",amt:100},{icon:"🏥",name:"医療・介護",amt:200},{icon:"🎓",name:"教育費",amt:100},{icon:"💍",name:"冠婚葬祭",amt:100},{icon:"🖥️",name:"PC・機器",amt:30},{icon:"💰",name:"その他",amt:100}].map(cat=>(
                <button key={cat.name} onClick={()=>setP(prev=>({...prev,events:[...(prev.events||[]),{id:Date.now(),name:cat.name,year:3,amount:cat.amt,icon:cat.icon}]}))}
                  style={{ padding:"10px 4px",borderRadius:10,border:`1.5px solid ${C.purple}30`,background:"#F5F3FF",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
                  <span style={{ fontSize:22 }}>{cat.icon}</span>
                  <span style={{ fontSize:10,fontWeight:700,color:C.purple }}>{cat.name}</span>
                  <span style={{ fontSize:9,color:C.muted }}>{cat.amt}万〜</span>
                </button>
              ))}
            </div>
          </div>
        </>)}

        {/* ══ STEP 6: 結果 ══════════════════════════════════════════ */}
        {step === 6 && (<>
          {/* KPIカード */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[
              { label: "退職時・総資産", value: fmt(retireData?.total??0), sub: `${p.myRetireAge}歳時点`, ok: (retireData?.total??0)>0 },
              { label: "資産ピーク", value: fmt(peakTotal), sub: "最大蓄積額" },
              { label: crossZeroAge?"資産枯渇年齢":"最終資産", value: crossZeroAge?`${crossZeroAge}歳`:fmt(finalTotal), sub: crossZeroAge?"早めの対策を":`${p.lifeExpectancy}歳時点`, warn:!!crossZeroAge, ok:!crossZeroAge&&finalTotal>0 },
              { label: "月間投資（現在）", value: `${Math.round((p.myNisaAnnual1+(p.hasSpouse?p.spouseNisaAnnual1:0)+p.myStockAnnual1+(p.hasSpouse?p.spouseStockAnnual1:0))/12)}万円`, sub: "NISA+証券合計" },
            ].map((k,i)=>(
              <div key={i} style={{ background: C.panel, border: `1.5px solid ${k.warn?C.red:k.ok?C.green:C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: k.warn?C.red:k.ok?C.green:C.dark }}>{k.value}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* アドバイス */}
          {minusYears.length > 0 ? (
            <div style={{ background:"rgba(239,68,68,0.08)", border:`1px solid ${C.red}30`, borderRadius:12, padding:"12px 14px", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.red, marginBottom:4 }}>⚠️ 退職前に収支マイナスが {minusYears.length}年間</div>
              <div style={{ fontSize:11, color:C.text }}>最大赤字 {Math.abs(Math.min(...minusYears.map(d=>d.cashFlow))).toLocaleString()}万円/年。投資額か生活費の見直しをSTEP2〜3で検討してください。</div>
            </div>
          ) : (
            <div style={{ background:"rgba(16,185,129,0.08)", border:`1px solid ${C.green}30`, borderRadius:12, padding:"12px 14px", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.green }}>✅ 退職前は収支プラスを維持できています</div>
            </div>
          )}

          {/* 資産推移グラフ */}
          <div style={{ background: C.panel, borderRadius: 16, padding: "14px 10px 10px", marginBottom: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10, paddingLeft: 4 }}>📈 総資産推移</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data} margin={{ top: 14, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  {[["gc",C.yellow],["gn",C.green],["gn2","#34D399"],["gs",C.accent],["gs2","#93C5FD"],["gk1","#F59E0B"],["gk2","#FCD34D"],["gp","#94A3B8"]].map(([id,c])=>(
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={c} stopOpacity={0.7}/>
                      <stop offset="95%" stopColor={c} stopOpacity={0.05}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis {...xAx} />
                <YAxis tick={{fontSize:10,fill:C.muted}} tickFormatter={v=>`${Math.round(v/100)}百万`} width={46} />
                <Tooltip content={({active,payload,label})=>{
                  if(!active||!payload?.length) return null;
                  return <div style={{background:C.dark,borderRadius:10,padding:"10px 14px",fontSize:12}}>
                    <div style={{color:"#93C5FD",fontWeight:700,marginBottom:6}}>{label}歳（{BASE_YEAR+label-p.myAge}年）</div>
                    {payload.filter(p2=>p2.value>0).map((p2,i)=><div key={i} style={{color:p2.color,marginBottom:2}}>{p2.name}: <strong>{Math.round(p2.value).toLocaleString()}万円</strong></div>)}
                  </div>;
                }}/>
                <ReferenceLine y={0} stroke={C.red} strokeWidth={1.5}/>
                <ReferenceLine x={p.myRetireAge} stroke={C.yellow} strokeDasharray="5 3" label={{value:"退職",position:"top",fontSize:8,fill:C.yellow}}/>
                <Area type="monotone" dataKey="cashAsset" name="現金" stroke={C.yellow} fill="url(#gc)" strokeWidth={1.5} dot={false} stackId="a"/>
                <Area type="monotone" dataKey="myNisaAsset" name="本人NISA" stroke={C.green} fill="url(#gn)" strokeWidth={1.5} dot={false} stackId="a"/>
                {p.hasSpouse && <Area type="monotone" dataKey="spouseNisaAsset" name="妻NISA" stroke="#34D399" fill="url(#gn2)" strokeWidth={1.5} dot={false} stackId="a"/>}
                <Area type="monotone" dataKey="myStockAsset" name="本人証券" stroke={C.accent} fill="url(#gs)" strokeWidth={1.5} dot={false} stackId="a"/>
                {p.hasSpouse && <Area type="monotone" dataKey="spouseStockAsset" name="妻証券" stroke="#93C5FD" fill="url(#gs2)" strokeWidth={1.5} dot={false} stackId="a"/>}
                {p.childCount>0 && <Area type="monotone" dataKey="kid1NisaAsset" name="子1NISA" stroke="#F59E0B" fill="url(#gk1)" strokeWidth={1.5} dot={false} stackId="a"/>}
                {p.childCount>1 && <Area type="monotone" dataKey="kid2NisaAsset" name="子2NISA" stroke="#FCD34D" fill="url(#gk2)" strokeWidth={1.5} dot={false} stackId="a"/>}
                {(p.housingType==="own"||(p.houses||[]).length>0) && <Area type="monotone" dataKey="propVal" name="不動産評価額" stroke="#94A3B8" fill="url(#gp)" strokeWidth={1.5} dot={false} stackId="a"/>}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 収支グラフ */}
          <div style={{ background: C.panel, borderRadius: 16, padding: "14px 10px 10px", marginBottom: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10, paddingLeft: 4 }}>💴 年間収支</div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={data} margin={{top:14,right:4,left:-10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis {...xAx}/>
                <YAxis tick={{fontSize:10,fill:C.muted}} tickFormatter={v=>`${v}万`} width={46}/>
                <Tooltip content={({active,payload,label})=>{
                  if(!active||!payload?.length) return null;
                  return <div style={{background:C.dark,borderRadius:10,padding:"10px 14px",fontSize:12}}>
                    <div style={{color:"#93C5FD",fontWeight:700,marginBottom:6}}>{label}歳（{BASE_YEAR+label-p.myAge}年）</div>
                    {payload.map((p2,i)=><div key={i} style={{color:p2.color,marginBottom:2}}>{p2.name}: <strong>{Math.round(p2.value).toLocaleString()}万円</strong></div>)}
                  </div>;
                }}/>
                <ReferenceLine y={0} stroke={C.orange} strokeWidth={1.5} strokeDasharray="3 3"/>
                <ReferenceLine x={p.myRetireAge} stroke={C.yellow} strokeDasharray="5 3"/>
                <Line type="monotone" dataKey="income" name="手取り収入" stroke={C.green} dot={false} strokeWidth={2.5}/>
                <Line type="monotone" dataKey="livingCost" name="生活費" stroke={C.red} dot={false} strokeWidth={2}/>
                <Line type="monotone" dataKey="cashFlow" name="年間収支" stroke={C.orange} dot={false} strokeWidth={2} strokeDasharray="6 2"/>
              </LineChart>
            </ResponsiveContainer>
            <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:8,fontSize:11,flexWrap:"wrap"}}>
              <span style={{color:C.green,fontWeight:700}}>─ 収入</span>
              <span style={{color:C.red,fontWeight:700}}>─ 生活費</span>
              <span style={{color:C.orange,fontWeight:700}}>-- 収支</span>
            </div>
          </div>

          {/* 保存・共有・CSV */}
          <div style={{ background: "linear-gradient(135deg,#1A2332,#0F2027)", borderRadius: 16, padding: "16px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 10 }}>💾 保存・共有</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["💾","保存",saveData,"#7C3AED"],["🔗","共有リンク",shareLink,"#0369A1"],["📋","CSV出力",()=>exportCSV(data),"#166834"]].map(([ic,lb,fn,bg])=>(
                <button key={lb} onClick={fn} style={{padding:"12px 4px",borderRadius:10,border:"none",cursor:"pointer",background:`linear-gradient(135deg,${bg},${bg}cc)`,color:"#fff",fontWeight:700,fontSize:11,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <span style={{fontSize:18}}>{ic}</span><span>{lb}</span>
                </button>
              ))}
            </div>
          </div>
        </>)}

        {/* ナビゲーションボタン */}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          {step > 1 && (
            <button onClick={goPrev} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${C.border}`, background: "#fff", color: C.text, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              ← 戻る
            </button>
          )}
          {step < 6 && (
            <button onClick={goNext} style={{ flex: 2, padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.accent},#2563EB)`, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              次へ →
            </button>
          )}
          {step === 6 && (
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${C.accent}`, background: "#fff", color: C.accent, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ✏️ 設定を編集
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
