import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

// ── カラーパレット ────────────────────────────────────────────────
const C = {
  bg:"#F0F4F8", panel:"#FFFFFF", dark:"#1A2332",
  accent:"#3B82F6", green:"#10B981", border:"#E2E8F0",
  text:"#1E293B", muted:"#94A3B8", red:"#EF4444",
  yellow:"#F59E0B", purple:"#8B5CF6", orange:"#F97316",
};
const BASE_YEAR = new Date().getFullYear();
const NISA_TSUMI_LIMIT = 600;   // 積立投資枠 生涯上限（万円）
const NISA_GROWTH_LIMIT = 1200; // 成長投資枠 生涯上限（万円）

// ── デフォルト値 ──────────────────────────────────────────────────
const DEFAULTS = {
  // STEP1
  myAge:30, myTakeHome:400, myIncomeGrowth:1.0,
  myRetireAge:65, myPension:150, myCash:200,
  myNisaTsumiBalance:0, myNisaGrowthBalance:0, myRetireBonus:500,
  hasSpouse:true,
  spouseAge:28, spouseTakeHome:250, spouseIncomeGrowth:1.0,
  spouseRetireAge:63, spousePension:100, spouseCash:100,
  spouseNisaTsumiBalance:0, spouseNisaGrowthBalance:0, spouseRetireBonus:0,
  spouseAdjEnabled:false, spouseAdjStart:BASE_YEAR+1, spouseAdjEnd:BASE_YEAR+3, spouseAdjRatio:0,
  childCount:0,
  children:[], // [{age}]
  lifeExpectancy:90,
  useIncomeCoef:true,
  spouseUseIncomeCoef:true,
  // STEP2
  housingType:"rent",
  rentSegments:[{amount:120}],
  houses:[],
  propertyInitialValue:0, propertyBuildYear:BASE_YEAR,
  propertyDepreciationRate:1.5, propertyTaxEnabled:true, propertyTaxRate:0.14,
  food:60, daily:10, utility:20, comm:12,
  transport:12, leisure:30, insurance:60, clothing:10, medical:8, other:20,
  eduNursery:30, eduElementary:60, eduJunior:114, eduHigh:97, eduCollege:103,
  hasCarMaint:false, carGasoline:6, carTax:4, carInsurance:6,
  recurringEvents:[
    {id:1, name:"車検", amount:10, intervalYears:2, startYear:2},
    {id:2, name:"タイヤ交換", amount:5, intervalYears:4, startYear:4},
  ],
  // STEP3: 自由な期間セグメント
  myNisaTsumiSegs:[{endYear:null, annual:60}],
  myNisaGrowthSegs:[{endYear:null, annual:0}],
  myNisaTsumiReturn:5.0, myNisaGrowthReturn:6.0,
  spouseNisaTsumiSegs:[{endYear:null, annual:0}],
  spouseNisaGrowthSegs:[{endYear:null, annual:0}],
  spouseNisaTsumiReturn:5.0, spouseNisaGrowthReturn:6.0,
  myNisaStart:BASE_YEAR, myNisaEnd:BASE_YEAR+35,
  spouseNisaStart:BASE_YEAR, spouseNisaEnd:BASE_YEAR+35,
  myStockSegs:[{endYear:null, annual:0}],
  myStockReturn:6.0, myStockStart:BASE_YEAR, myStockEnd:BASE_YEAR+35,
  spouseStockSegs:[{endYear:null, annual:0}],
  spouseStockReturn:6.0, spouseStockStart:BASE_YEAR, spouseStockEnd:BASE_YEAR+30,
  cashReturn:0.3,
  kidNisaReturn:5.0,
  kid1NisaAnnual:0, kid1NisaStart:BASE_YEAR+1, kid1NisaEnd:BASE_YEAR+15, kid1NisaWithdraw:BASE_YEAR+18,
  kid2NisaAnnual:0, kid2NisaStart:BASE_YEAR+1, kid2NisaEnd:BASE_YEAR+15, kid2NisaWithdraw:BASE_YEAR+20,
  events:[],
};

// ── 変動係数 ──────────────────────────────────────────────────────
const INCOME_COEF = [
  {max:19,c:1.321},{max:24,c:1.046},{max:29,c:1.024},{max:34,c:1.024},
  {max:39,c:1.017},{max:44,c:1.011},{max:49,c:1.011},{max:54,c:1.005},
  {max:59,c:1.005},{max:64,c:1.005},{max:69,c:1.005},{max:999,c:0.883},
];
function applyCoef(base, fromAge, toAge) {
  let v = base;
  for (let a = fromAge; a < Math.min(toAge, 70); a++)
    v *= (INCOME_COEF.find(e => a<=e.max)||INCOME_COEF[INCOME_COEF.length-1]).c;
  return v;
}

// ── セグメントから年額を取得 ──────────────────────────────────────
function getSegAnnual(segs, cy) {
  if (!segs||!segs.length) return 0;
  for (let i=0; i<segs.length-1; i++) {
    if (segs[i].endYear && cy<=segs[i].endYear) return segs[i].annual||0;
  }
  return segs[segs.length-1].annual||0;
}

// ── シミュレーション ──────────────────────────────────────────────
function simulate(p) {
  const annualLiving = p.food+p.daily+p.utility+p.comm+p.transport+p.leisure+p.clothing+p.medical+p.other;
  let cash = p.myCash+(p.hasSpouse?p.spouseCash:0);
  let myNisaTsumi=p.myNisaTsumiBalance||0, myNisaGrowth=p.myNisaGrowthBalance||0;
  let spNisaTsumi=p.spouseNisaTsumiBalance||0, spNisaGrowth=p.spouseNisaGrowthBalance||0;
  let myStock=0, spStock=0, kid1=0, kid2=0;
  let myNisaTsumiTotal=p.myNisaTsumiBalance||0, myNisaGrowthTotal=p.myNisaGrowthBalance||0;
  let spNisaTsumiTotal=p.spouseNisaTsumiBalance||0, spNisaGrowthTotal=p.spouseNisaGrowthBalance||0;
  const rows=[];
  const houses=p.houses||[];
  const children=p.children||[];

  for (let age=p.myAge; age<=p.lifeExpectancy; age++) {
    const yr=age-p.myAge, cy=BASE_YEAR+yr;
    const myRetired=age>=p.myRetireAge;
    const spRetired=p.hasSpouse&&(p.spouseAge+yr)>=p.spouseRetireAge;
    const bothRetired=myRetired&&(!p.hasSpouse||spRetired);

    // 収入
    const myInc=myRetired?p.myPension
      :p.useIncomeCoef?applyCoef(p.myTakeHome,p.myAge,age)
      :p.myTakeHome*Math.pow(1+p.myIncomeGrowth/100,Math.min(yr,Math.max(0,55-p.myAge)));
    const inAdj=p.hasSpouse&&p.spouseAdjEnabled&&cy>=p.spouseAdjStart&&cy<=p.spouseAdjEnd;
    const spRaw=!p.hasSpouse?0
      :p.spouseUseIncomeCoef?applyCoef(p.spouseTakeHome,p.spouseAge,p.spouseAge+yr)
      :p.spouseTakeHome*Math.pow(1+p.spouseIncomeGrowth/100,Math.min(yr,Math.max(0,55-p.spouseAge)));
    const spInc=!p.hasSpouse?0:spRetired?p.spousePension:inAdj?spRaw*(p.spouseAdjRatio/100):spRaw;
    const income=myInc+spInc;
    const myBonus=age===p.myRetireAge?p.myRetireBonus:0;
    const spBonus=p.hasSpouse&&(p.spouseAge+yr)===p.spouseRetireAge?p.spouseRetireBonus:0;

    // 家賃
    const boughtAny=houses.some(h=>yr>=h.year&&(h.cashPrice>0||h.loan>0));
    let rentY=0;
    if (p.housingType==="rent"&&!boughtAny) {
      const segs=(p.rentSegments&&p.rentSegments.length>0)?p.rentSegments:[{amount:120}];
      let matched=segs[segs.length-1];
      for (let k=0;k<segs.length-1;k++){if(segs[k].endYear&&cy<=segs[k].endYear){matched=segs[k];break;}}
      rentY=matched.amount||0;
    }

    // ローン
    let cashBuy=0,loanCost=0;
    houses.forEach(h=>{
      if(yr===h.year&&h.cashPrice>0) cashBuy+=h.cashPrice;
      if(h.loan>0&&yr>=h.year&&yr<h.year+h.loanYears){
        const lm=(h.loan*(h.loanRate/100/12)*Math.pow(1+h.loanRate/100/12,h.loanYears*12))/(Math.pow(1+h.loanRate/100/12,h.loanYears*12)-1);
        loanCost+=lm*12;
      }
    });

    // 固定資産税・管理費・修繕費
    const ownedSinceYr=houses.length>0&&(houses[0].cashPrice>0||houses[0].loan>0)?houses[0].year
      :p.housingType==="own"?0:null;
    const isOwned=ownedSinceYr!==null&&yr>=ownedSinceYr;
    const basePrice=houses.length>0?(houses[0].cashPrice+houses[0].loan):(p.propertyInitialValue||0);
    const ownedYrs=isOwned?yr-(ownedSinceYr||0):0;
    const propTaxAnnual=isOwned&&p.propertyTaxEnabled&&basePrice>0
      ?basePrice*(p.propertyTaxRate/100)*Math.max(0.1,1-ownedYrs*0.02):0;
    const propVal=isOwned&&basePrice>0
      ?basePrice*Math.pow(1-(p.propertyDepreciationRate||1.5)/100,ownedYrs):0;
    // 管理費・修繕費（マンションの場合）
    const houseInfo=houses.length>0?houses[0]:null;
    const condoFee=isOwned&&houseInfo?.isCondo?((houseInfo.manageFee||0)+(houseInfo.repairFee||0)):0;
    const ownCost=propTaxAnnual+condoFee; // グラフ用

    // 教育費（複数子供対応）
    const edu=ca0=>{const ca=ca0+yr;if(ca>=0&&ca<6)return p.eduNursery;if(ca>=6&&ca<12)return p.eduElementary;if(ca>=12&&ca<15)return p.eduJunior;if(ca>=15&&ca<18)return p.eduHigh;if(ca>=18&&ca<22)return p.eduCollege;return 0;};
    const eduCost=children.reduce((s,c)=>s+edu(c.age),0);

    // 投資（自由セグメント）
    // NISA: 退職前かつ生涯上限未達の間だけ積立（開始/終了年設定不要）
    const myNisaTsumiC=!myRetired&&myNisaTsumiTotal<NISA_TSUMI_LIMIT?Math.min(getSegAnnual(p.myNisaTsumiSegs,cy),NISA_TSUMI_LIMIT-myNisaTsumiTotal):0;
    const myNisaGrowthC=!myRetired&&myNisaGrowthTotal<NISA_GROWTH_LIMIT?Math.min(getSegAnnual(p.myNisaGrowthSegs,cy),NISA_GROWTH_LIMIT-myNisaGrowthTotal):0;
    const spNisaTsumiC=p.hasSpouse&&!spRetired&&spNisaTsumiTotal<NISA_TSUMI_LIMIT?Math.min(getSegAnnual(p.spouseNisaTsumiSegs,cy),NISA_TSUMI_LIMIT-spNisaTsumiTotal):0;
    const spNisaGrowthC=p.hasSpouse&&!spRetired&&spNisaGrowthTotal<NISA_GROWTH_LIMIT?Math.min(getSegAnnual(p.spouseNisaGrowthSegs,cy),NISA_GROWTH_LIMIT-spNisaGrowthTotal):0;
    const myStockC=!bothRetired&&cy>=p.myStockStart&&cy<=p.myStockEnd?getSegAnnual(p.myStockSegs,cy):0;
    const spStockC=p.hasSpouse&&!bothRetired&&cy>=p.spouseStockStart&&cy<=p.spouseStockEnd?getSegAnnual(p.spouseStockSegs,cy):0;
    myNisaTsumiTotal+=myNisaTsumiC; myNisaGrowthTotal+=myNisaGrowthC;
    spNisaTsumiTotal+=spNisaTsumiC; spNisaGrowthTotal+=spNisaGrowthC;
    const investTotal=myNisaTsumiC+myNisaGrowthC+spNisaTsumiC+spNisaGrowthC+myStockC+spStockC;

    // 車・定期（carEndAge以降は発生しない）
    const carActive=p.hasCarMaint&&(!p.carEndAge||age<p.carEndAge);
    const carMaintCost=carActive?(p.carGasoline||6)+(p.carTax||4)+(p.carInsurance||6):0;
    const recurringCost=carActive?(p.recurringEvents||[]).filter(ev=>ev.startYear<=yr&&(yr-ev.startYear)%ev.intervalYears===0).reduce((s,ev)=>s+ev.amount,0):0;
    const eventCost=(p.events||[]).filter(ev=>ev.year===yr).reduce((s,ev)=>s+ev.amount,0);

    const totalCost=annualLiving+rentY+loanCost+ownCost+eduCost+p.insurance+investTotal+carMaintCost+recurringCost;
    const cashFlow=income-totalCost;

    myNisaTsumi=myNisaTsumi*(1+(p.myNisaTsumiReturn||5)/100)+myNisaTsumiC;
    myNisaGrowth=myNisaGrowth*(1+(p.myNisaGrowthReturn||6)/100)+myNisaGrowthC;
    spNisaTsumi=spNisaTsumi*(1+(p.spouseNisaTsumiReturn||5)/100)+spNisaTsumiC;
    spNisaGrowth=spNisaGrowth*(1+(p.spouseNisaGrowthReturn||6)/100)+spNisaGrowthC;
    myStock=myStock*(1+(p.myStockReturn||6)/100)+myStockC;
    spStock=spStock*(1+(p.spouseStockReturn||6)/100)+spStockC;

    const k1c=p.kid1NisaAnnual>0&&cy>=p.kid1NisaStart&&cy<=p.kid1NisaEnd?p.kid1NisaAnnual:0;
    const k2c=p.kid2NisaAnnual>0&&cy>=p.kid2NisaStart&&cy<=p.kid2NisaEnd?p.kid2NisaAnnual:0;
    kid1=kid1*(1+(p.kidNisaReturn||5)/100)+k1c;
    kid2=kid2*(1+(p.kidNisaReturn||5)/100)+k2c;
    if(cy===p.kid1NisaWithdraw&&kid1>0){cash+=kid1;kid1=0;}
    if(cy===p.kid2NisaWithdraw&&kid2>0){cash+=kid2;kid2=0;}
    cash=cash*(1+(p.cashReturn||0.3)/100)+cashFlow+myBonus+spBonus-cashBuy-eventCost-k1c-k2c;

    houses.forEach(h=>{
      if(h.investWithdraw>0&&yr===h.year){
        const w=h.investWithdraw,allNisa=myNisaTsumi+myNisaGrowth+spNisaTsumi+spNisaGrowth;
        if(h.investSource==="nisa"){const tk=Math.min(w,allNisa),r=allNisa>0?tk/allNisa:0;myNisaTsumi=Math.max(0,myNisaTsumi*(1-r));myNisaGrowth=Math.max(0,myNisaGrowth*(1-r));spNisaTsumi=Math.max(0,spNisaTsumi*(1-r));spNisaGrowth=Math.max(0,spNisaGrowth*(1-r));cash+=tk;}
        else if(h.investSource==="stock"){const av=myStock+spStock,tk=Math.min(w,av),r=av>0?tk/av:0;myStock=Math.max(0,myStock*(1-r));spStock=Math.max(0,spStock*(1-r));cash+=tk;}
        else{const tn=Math.min(w,allNisa),rn=allNisa>0?tn/allNisa:0;myNisaTsumi=Math.max(0,myNisaTsumi*(1-rn));myNisaGrowth=Math.max(0,myNisaGrowth*(1-rn));spNisaTsumi=Math.max(0,spNisaTsumi*(1-rn));spNisaGrowth=Math.max(0,spNisaGrowth*(1-rn));const sa=myStock+spStock,ts=Math.min(w-tn,sa),rs=sa>0?ts/sa:0;myStock=Math.max(0,myStock*(1-rs));spStock=Math.max(0,spStock*(1-rs));cash+=tn+ts;}
      }
    });

    const _living=Math.round(annualLiving+rentY+loanCost+p.insurance);
    const _own=Math.round(ownCost), _edu=Math.round(eduCost);
    const _inv=Math.round(investTotal), _car=Math.round(carMaintCost+recurringCost);
    const _evt=Math.round(eventCost);
    rows.push({
      age,year:cy,income:Math.round(income),cashFlow:Math.round(cashFlow),
      livingCost:_living, ownCost:_own, eduCost:_edu,
      invest:_inv, carCost:_car, eventCost:_evt,
      negLiving:-_living, negOwn:-_own, negInvest:-_inv, negCar:-_car, negEvent:-_evt,
      cashAsset:Math.round(cash),
      myNisaTsumiAsset:Math.round(myNisaTsumi),myNisaGrowthAsset:Math.round(myNisaGrowth),
      spNisaTsumiAsset:Math.round(spNisaTsumi),spNisaGrowthAsset:Math.round(spNisaGrowth),
      myStockAsset:Math.round(myStock),spStockAsset:Math.round(spStock),
      kid1NisaAsset:Math.round(kid1),kid2NisaAsset:Math.round(kid2),
      propVal:Math.round(propVal),
      total:Math.round(cash+myNisaTsumi+myNisaGrowth+spNisaTsumi+spNisaGrowth+myStock+spStock+kid1+kid2+propVal),
    });
  }
  return rows;
}

// ── Excel出力（xlsx npm bundle・2シート） ──────────────────────
function exportExcel(p, data) {
  try {
    const wb = XLSX.utils.book_new();

    // ── Sheet1: サマリー ──
    const retireRow=data.find(d=>d.age===p.myRetireAge)||data[data.length-1];
    const finalRow=data[data.length-1];
    const crossZero=data.find(d=>d.total<0);
    const peakRow=data.reduce((a,b)=>b.total>a.total?b:a,data[0]);
    const summaryData=[
      ["ライフプランPro - サマリー",""],["",""],
      ["■ プロフィール",""],
      ["本人年齢",`${p.myAge}歳`],["本人手取り年収",`${p.myTakeHome}万円`],
      ["退職予定年齢",`${p.myRetireAge}歳`],["想定年金",`${p.myPension}万円`],
      ["想定寿命",`${p.lifeExpectancy}歳`],
      ...(p.hasSpouse?[["配偶者年齢",`${p.spouseAge}歳`],["配偶者手取り年収",`${p.spouseTakeHome}万円`]]:
        [["配偶者","なし"]]),
      ["子ども数",`${p.childCount}人`],
      ["",""],["■ 資産サマリー",""],
      ["退職時総資産",`${Math.round(retireRow.total).toLocaleString()}万円`],
      ["資産ピーク",`${Math.round(peakRow.total).toLocaleString()}万円（${peakRow.age}歳時）`],
      [crossZero?"資産枯渇年齢":"最終資産（寿命時）",crossZero?`${crossZero.age}歳`:`${Math.round(finalRow.total).toLocaleString()}万円`],
      ["",""],["■ 主な支出（現在）",""],
      ["家賃/ローン",`${Math.round((data[0]?.livingCost||0))}万円/年`],
      ["生活費合計",`${p.food+p.daily+p.utility+p.comm+p.transport+p.leisure+p.clothing+p.medical+p.other}万円/年`],
      ["保険料",`${p.insurance}万円/年`],
      ["",""],["■ 投資（現在）",""],
      ["NISA積立枠",`${getSegAnnual(p.myNisaTsumiSegs,BASE_YEAR)}万円/年`],
      ["NISA成長枠",`${getSegAnnual(p.myNisaGrowthSegs,BASE_YEAR)}万円/年`],
      ["証券口座",`${getSegAnnual(p.myStockSegs,BASE_YEAR)}万円/年`],
    ];
    const ws1=XLSX.utils.aoa_to_sheet(summaryData);
    ws1["!cols"]=[{wch:28},{wch:22}];
    XLSX.utils.book_append_sheet(wb,ws1,"サマリー");

    // ── Sheet2: 年次内訳 ──
    const headers=["西暦","本人歳","収入（万）","生活費（万）","住居費（万）","教育費（万）",
      "投資（万）","車・定期（万）","一時出費（万）","収支（万）","総資産（万）",
      "現金（万）","NISA積立（万）","NISA成長（万）","証券（万）","不動産評価（万）"];
    const rows2=data.map(d=>[
      d.year,d.age,d.income,d.livingCost,d.ownCost,d.eduCost,
      d.invest,d.carCost,d.eventCost,d.cashFlow,d.total,
      d.cashAsset,d.myNisaTsumiAsset+d.spNisaTsumiAsset,d.myNisaGrowthAsset+d.spNisaGrowthAsset,
      d.myStockAsset+d.spStockAsset,d.propVal
    ]);
    const ws2=XLSX.utils.aoa_to_sheet([headers,...rows2]);
    ws2["!cols"]=headers.map(()=>({wch:16}));
    XLSX.utils.book_append_sheet(wb,ws2,"年次内訳");

    XLSX.writeFile(wb,"lifeplan_report.xlsx");
  } catch(e) { alert("Excel出力に失敗しました: "+e.message); }
}

// ── 自動アドバイス生成 ────────────────────────────────────────────
function generateAdvice(p, data) {
  const advice = [];
  const retireRow=data.find(d=>d.age===p.myRetireAge)||data[0];
  const finalRow=data[data.length-1];
  const crossZero=data.find(d=>d.total<0);
  const minusYears=data.filter(d=>d.cashFlow<0&&d.age<p.myRetireAge);
  const totalIncome=(p.myTakeHome||0)+(p.hasSpouse?p.spouseTakeHome||0:0);
  const nisaAnnual=getSegAnnual(p.myNisaTsumiSegs,BASE_YEAR)+getSegAnnual(p.myNisaGrowthSegs,BASE_YEAR)
    +(p.hasSpouse?getSegAnnual(p.spouseNisaTsumiSegs,BASE_YEAR)+getSegAnnual(p.spouseNisaGrowthSegs,BASE_YEAR):0);
  const stockAnnual=getSegAnnual(p.myStockSegs,BASE_YEAR)+(p.hasSpouse?getSegAnnual(p.spouseStockSegs,BASE_YEAR):0);
  const totalInvest=nisaAnnual+stockAnnual;
  const investRatio=totalIncome>0?Math.round(totalInvest/totalIncome*100):0;

  if (crossZero) {
    advice.push({type:"danger",icon:"🚨",title:"資産枯渇リスク",body:`${crossZero.age}歳（${crossZero.year}年）で資産が枯渇する見込みです。生活費の削減か投資額の増加、または定年後の就労延長を検討してください。`});
  } else if (finalRow.total>0) {
    advice.push({type:"good",icon:"✅",title:"資産の持続性",body:`${p.lifeExpectancy}歳時点でも${Math.round(finalRow.total).toLocaleString()}万円が残ります。現在のプランは概ね健全です。`});
  }

  if (minusYears.length>5) {
    advice.push({type:"warn",icon:"⚠️",title:"退職前の収支赤字",body:`退職前に${minusYears.length}年間の収支マイナスがあります。最大赤字${Math.abs(Math.min(...minusYears.map(d=>d.cashFlow))).toLocaleString()}万円/年。投資額か生活費の見直しを検討してください。`});
  } else if (minusYears.length>0) {
    advice.push({type:"warn",icon:"⚡",title:"一時的な収支マイナス",body:`${minusYears.length}年間の収支マイナスがあります。特定の支出（住宅・教育等）が集中している可能性があります。`});
  }

  if (investRatio<10 && totalInvest<30) {
    advice.push({type:"warn",icon:"📈",title:"投資割合が低めです",body:`現在の投資割合は収入の約${investRatio}%（年${totalInvest}万円）です。一般的にFPは手取りの10〜20%の投資を推奨しています。NISA枠の活用から始めることをおすすめします。`});
  } else if (investRatio>30) {
    advice.push({type:"info",icon:"💡",title:"積極的な投資プラン",body:`投資割合が収入の${investRatio}%と高めです。生活費の余裕を確保しながら無理なく継続できるか確認してください。`});
  } else {
    advice.push({type:"good",icon:"📊",title:"バランスの良い投資比率",body:`投資割合は収入の${investRatio}%（年${totalInvest}万円）です。適切な範囲内です。`});
  }

  if (nisaAnnual<120 && totalIncome>300) {
    advice.push({type:"info",icon:"🏦",title:"NISA枠の活用余地あり",body:`現在のNISA積立は年${nisaAnnual}万円です。積立投資枠の上限（120万円/年）まで余裕があります。税優遇を最大限活用することで長期的な資産形成が有利になります。`});
  }

  if ((retireRow?.total||0)<(p.myPension+(p.hasSpouse?p.spousePension:0))*20) {
    advice.push({type:"warn",icon:"🔍",title:"退職後の資産補填",body:`退職時資産${Math.round(retireRow?.total||0).toLocaleString()}万円は年金以外の生活費を20年分カバーするには不足する可能性があります。退職金や資産の取り崩し計画を具体的に検討してください。`});
  }

  return advice;
}

// ── UI コンポーネント ─────────────────────────────────────────────
const Num = ({value, onChange, min=0, max=9999, step=1, unit="", color=C.accent, width=72}) => {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState("");
  const bump=d=>onChange(Math.min(max,Math.max(min,Math.round((value+d)*100)/100)));
  const bs=side=>({width:32,height:32,borderRadius:side==="l"?"8px 0 0 8px":"0 8px 8px 0",border:`2px solid ${color}`,borderLeft:side==="r"?"none":undefined,borderRight:side==="l"?"none":undefined,background:"#F8FAFC",color,fontSize:18,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0});
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <div style={{display:"flex"}}>
        <button onClick={()=>bump(-step)} style={bs("l")}>－</button>
        <input inputMode="decimal" value={editing?draft:value}
          onFocus={()=>{setDraft(String(value));setEditing(true);}}
          onBlur={()=>{setEditing(false);const n=Number(draft);if(!isNaN(n))onChange(Math.min(max,Math.max(min,n)));}}
          onChange={e=>setDraft(e.target.value)}
          style={{width,height:32,padding:"0 4px",border:`2px solid ${color}`,borderLeft:"none",borderRight:"none",fontSize:13,fontWeight:700,textAlign:"center",color:C.dark,outline:"none",background:"#fff"}}/>
        <button onClick={()=>bump(step)} style={bs("r")}>＋</button>
      </div>
      {unit&&<span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>{unit}</span>}
    </div>
  );
};
const Row=({label,sub,children})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
    <div style={{flex:1,paddingRight:8}}><div style={{fontSize:13,color:C.text}}>{label}</div>{sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}</div>
    {children}
  </div>
);
const Toggle=({value,onChange,color=C.accent})=>(
  <button onClick={()=>onChange(!value)} style={{width:48,height:26,borderRadius:13,border:"none",cursor:"pointer",background:value?color:"#CBD5E1",position:"relative",flexShrink:0}}>
    <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:value?25:3,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
  </button>
);
const Card=({children,color,mb=16})=>(
  <div style={{background:C.panel,borderRadius:16,padding:"0 16px 16px",border:`1.5px solid ${color||C.border}`,marginBottom:mb}}>{children}</div>
);
const SH=({title,icon,color})=>(
  <div style={{display:"flex",alignItems:"center",gap:8,padding:"14px 0 6px"}}>
    <span style={{fontSize:16}}>{icon}</span>
    <span style={{fontSize:13,fontWeight:700,color:color||C.accent}}>{title}</span>
  </div>
);
const Chip=({label,selected,onClick,color=C.accent})=>(
  <button onClick={onClick} style={{padding:"8px 14px",borderRadius:20,border:`2px solid ${selected?color:C.border}`,background:selected?color:"#fff",color:selected?"#fff":C.muted,fontSize:13,fontWeight:600,cursor:"pointer"}}>{label}</button>
);

// 自由セグメント入力コンポーネント
const SegEditor=({segs,onChange,max,step=1,unit="万",color=C.green,label="年額"})=>{
  const addSeg=()=>{
    const s=[...segs];
    const lastEnd=s[s.length-2]?.endYear||BASE_YEAR+4;
    s.splice(s.length-1,0,{endYear:lastEnd+5,annual:s[s.length-1]?.annual||0});
    onChange(s);
  };
  const removeSeg=i=>onChange(segs.filter((_,j)=>j!==i));
  const updateSeg=(i,k,v)=>{const s=[...segs];s[i]={...s[i],[k]:v};onChange(s);};
  return (
    <div>
      {segs.map((seg,i)=>{
        const isLast=i===segs.length-1;
        const prevEnd=i===0?BASE_YEAR-1:(segs[i-1].endYear||BASE_YEAR);
        const lbl=isLast?`${prevEnd+1}年〜`:`${prevEnd+1}〜${seg.endYear}年`;
        return (
          <div key={i} style={{background:"#F8FAFC",borderRadius:10,padding:"8px 12px",marginBottom:6,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:700,color}}>{lbl}</span>
              {segs.length>1&&<button onClick={()=>removeSeg(i)} style={{background:"#FEF2F2",border:"none",borderRadius:5,padding:"2px 6px",color:C.red,cursor:"pointer",fontSize:10}}>削除</button>}
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              {!isLast&&<div><div style={{fontSize:9,color:C.muted,marginBottom:2}}>この期間の終わり</div><Num value={seg.endYear||BASE_YEAR+4} onChange={v=>updateSeg(i,"endYear",v)} min={BASE_YEAR} max={2070} unit="年まで" color={color} width={60}/></div>}
              <div><div style={{fontSize:9,color:C.muted,marginBottom:2}}>{label}（年額）</div><Num value={seg.annual||0} onChange={v=>updateSeg(i,"annual",v)} min={0} max={max} step={step} unit={unit} color={color} width={64}/></div>
            </div>
          </div>
        );
      })}
      <button onClick={addSeg} style={{width:"100%",padding:8,borderRadius:8,border:`2px dashed ${color}`,background:"transparent",color,fontWeight:700,fontSize:12,cursor:"pointer"}}>＋ 期間を追加</button>
    </div>
  );
};

// NISA満額達成年計算
function calcNisaFillYear(segs, start, limit) {
  let total=0, yr=0;
  for (let cy=start; cy<=2080; cy++) {
    const annual=getSegAnnual(segs,cy);
    if(annual<=0) {yr++;continue;}
    total+=annual;
    if(total>=limit) return cy;
    yr++;
  }
  return null;
}

const STEPS=[{id:1,icon:"👤",label:"プロフィール"},{id:2,icon:"💸",label:"収支"},{id:3,icon:"📈",label:"投資"},{id:4,icon:"🏠",label:"不動産"},{id:5,icon:"🎯",label:"イベント"},{id:6,icon:"📊",label:"結果"}];

export default function LifePlanPro() {
  const [p,setP]=useState(()=>{
    try{
      const hash=window.location.hash.slice(1);
      if(hash){
        try{
          // URL-safe base64 → standard base64
          const b64=hash.replace(/-/g,"+").replace(/_/g,"/");
          const padded=b64+("===".slice((b64.length%4)||4));
          const bin=atob(padded);
          const bytes=new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
          const json=new TextDecoder().decode(bytes);
          const d=JSON.parse(json);
          return{...DEFAULTS,...d};
        }catch(e2){
          try{ const d=JSON.parse(decodeURIComponent(atob(hash))); return{...DEFAULTS,...d}; }catch(e3){}
        }
      }
      const saved=localStorage.getItem("lifeplan_pro_v5");
      if(saved) return{...DEFAULTS,...JSON.parse(saved)};
    }catch(e){}
    return{...DEFAULTS};
  });
  const [step,setStep]=useState(1);
  const [notice,setNotice]=useState(null);

  const set=k=>v=>setP(prev=>({...prev,[k]:v}));

  const save=()=>{try{localStorage.setItem("lifeplan_pro_v5",JSON.stringify(p));setNotice("saved");setTimeout(()=>setNotice(null),2500);}catch(e){}};

  // ⑨ URLハッシュ共有（全データをbase64エンコード）
  const [shareUrl,setShareUrl]=useState(null);
  const share=()=>{
    try{
      const json=JSON.stringify(p);
      const bytes=new TextEncoder().encode(json);
      let bin="";
      bytes.forEach(b=>bin+=String.fromCharCode(b));
      const b64=btoa(bin);
      // btoa出力はASCIIのみなのでURLセーフに変換
      const b64url=b64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
      const url=`${location.origin}${location.pathname}#${b64url}`;
      setShareUrl(url);
      if(navigator.clipboard?.writeText){
        navigator.clipboard.writeText(url).then(()=>{setNotice("shared");}).catch(()=>{setNotice("shared");});
      } else {
        setNotice("shared");
      }
      setTimeout(()=>{setNotice(null);},4000);
    }catch(e){setNotice("error");setTimeout(()=>setNotice(null),2500);}
  };

  const data=useMemo(()=>simulate(p),[p]);
  const retireRow=data.find(d=>d.age===p.myRetireAge)||data[0];
  const peakTotal=Math.max(0,...data.map(d=>d.total));
  const crossZero=data.find(d=>d.total<0);
  const finalRow=data[data.length-1];
  const minusYears=data.filter(d=>d.cashFlow<0&&d.age<p.myRetireAge);
  const advice=useMemo(()=>generateAdvice(p,data),[p,data]);

  const totalMonthlyInvest=Math.round((
    getSegAnnual(p.myNisaTsumiSegs,BASE_YEAR)+getSegAnnual(p.myNisaGrowthSegs,BASE_YEAR)+
    (p.hasSpouse?getSegAnnual(p.spouseNisaTsumiSegs,BASE_YEAR)+getSegAnnual(p.spouseNisaGrowthSegs,BASE_YEAR):0)+
    getSegAnnual(p.myStockSegs,BASE_YEAR)+(p.hasSpouse?getSegAnnual(p.spouseStockSegs,BASE_YEAR):0)
  )/12);

  // NISA満額達成年
  const myTsumiFullYear=calcNisaFillYear(p.myNisaTsumiSegs,BASE_YEAR,NISA_TSUMI_LIMIT-(p.myNisaTsumiBalance||0));
  const myGrowthFullYear=calcNisaFillYear(p.myNisaGrowthSegs,BASE_YEAR,NISA_GROWTH_LIMIT-(p.myNisaGrowthBalance||0));
  const spTsumiFullYear=p.hasSpouse?calcNisaFillYear(p.spouseNisaTsumiSegs,BASE_YEAR,NISA_TSUMI_LIMIT-(p.spouseNisaTsumiBalance||0)):null;
  const spGrowthFullYear=p.hasSpouse?calcNisaFillYear(p.spouseNisaGrowthSegs,BASE_YEAR,NISA_GROWTH_LIMIT-(p.spouseNisaGrowthBalance||0)):null;

  const DualTick=({x,y,payload})=>(
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" fill={C.muted} fontSize={9}>{payload.value}歳</text>
      <text x={0} y={0} dy={22} textAnchor="middle" fill="#94A3B8" fontSize={8}>{BASE_YEAR+payload.value-p.myAge}</text>
    </g>
  );
  const xAx={dataKey:"age",interval:9,tickLine:false,height:34,tick:DualTick};

  const updateHouse=(i,k,v)=>setP(prev=>{const hs=[...(prev.houses||[])];hs[i]={...hs[i],[k]:v};return{...prev,houses:hs};});
  const removeHouse=i=>setP(prev=>({...prev,houses:(prev.houses||[]).filter((_,j)=>j!==i)}));
  const houseColors=[C.yellow,C.orange,C.red];

  const updateSeg=(i,k,v)=>setP(prev=>{const s=[...(prev.rentSegments||[])];s[i]={...s[i],[k]:v};return{...prev,rentSegments:s};});
  const addSeg=()=>setP(prev=>{const s=[...(prev.rentSegments||[{amount:120}])];const le=s[s.length-2]?.endYear||BASE_YEAR+4;s.splice(s.length-1,0,{endYear:le+5,amount:s[s.length-1]?.amount||120});return{...prev,rentSegments:s};});
  const removeSeg=i=>setP(prev=>{const s=(prev.rentSegments||[]).filter((_,j)=>j!==i);return{...prev,rentSegments:s.length?s:[{amount:120}]};});

  const updateRecurring=(id,k,v)=>setP(prev=>({...prev,recurringEvents:(prev.recurringEvents||[]).map(e=>e.id===id?{...e,[k]:v}:e)}));
  const addRecurring=()=>setP(prev=>({...prev,recurringEvents:[...(prev.recurringEvents||[]),{id:Date.now(),name:"定期出費",amount:10,intervalYears:2,startYear:1}]}));
  const removeRecurring=id=>setP(prev=>({...prev,recurringEvents:(prev.recurringEvents||[]).filter(e=>e.id!==id)}));

  const updateChild=(i,k,v)=>setP(prev=>{const c=[...(prev.children||[])];c[i]={...c[i],[k]:v};return{...prev,children:c};});

  const adviceColors={danger:"rgba(239,68,68,0.1)",warn:"rgba(249,115,22,0.1)",good:"rgba(16,185,129,0.1)",info:"rgba(59,130,246,0.1)"};
  const adviceBorders={danger:C.red,warn:C.orange,good:C.green,info:C.accent};

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"-apple-system,sans-serif"}}>
      {/* ヘッダー */}
      <div style={{background:C.dark,padding:"12px 16px 0",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:640,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div><div style={{fontSize:15,fontWeight:800,color:"#fff"}}>ライフプランPro</div><div style={{fontSize:10,color:"#64748B"}}>v5.0</div></div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={save} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#7C3AED",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>💾 保存</button>
              <button onClick={share} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#0369A1",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔗 共有</button>
            </div>
          </div>
          {notice&&(
            <div style={{background:notice==="saved"?"#065F46":"#1E3A5F",borderRadius:8,padding:"6px 12px",fontSize:12,color:"#fff",fontWeight:700,textAlign:"center",marginBottom:4}}>
              {notice==="saved"?"✅ 保存しました":"✅ 共有URL（タップしてコピー）"}
            </div>
          )}
          {notice==="shared"&&shareUrl&&(
            <div onClick={()=>{navigator.clipboard?.writeText(shareUrl);}} style={{background:"#0F172A",borderRadius:8,padding:"6px 10px",fontSize:9,color:"#93C5FD",marginBottom:8,wordBreak:"break-all",cursor:"pointer",border:"1px solid #1E3A5F"}}>
              {shareUrl}
            </div>
          )}
          <div style={{display:"flex"}}>
            {STEPS.map(s=>(
              <button key={s.id} onClick={()=>setStep(s.id)} style={{flex:1,padding:"8px 2px",border:"none",cursor:"pointer",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:3,borderBottom:step===s.id?`3px solid ${C.accent}`:"3px solid transparent"}}>
                <span style={{fontSize:14}}>{s.icon}</span>
                <span style={{fontSize:8,color:step===s.id?"#93C5FD":"#475569",fontWeight:step===s.id?700:400}}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:640,margin:"0 auto",padding:"16px 14px 100px"}}>

        {/* ══ STEP 1 ══ */}
        {step===1&&(
          <div>
            <div style={{background:"linear-gradient(135deg,#1E40AF,#3B82F6)",borderRadius:16,padding:20,marginBottom:16,color:"#fff"}}>
              <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>👤 基本情報</div>
              <div style={{fontSize:12,opacity:0.8}}>あなたのライフプランを作成します</div>
            </div>
            <Card color={C.accent+"40"}>
              <SH title="本人" icon="🧑" color={C.accent}/>
              <Row label="現在の年齢"><Num value={p.myAge} onChange={set("myAge")} min={20} max={70} unit="歳"/></Row>
              <Row label="手取り年収"><Num value={p.myTakeHome} onChange={set("myTakeHome")} min={0} max={3000} step={10} unit="万円" width={80}/></Row>
              <Row label="FP標準変動係数を使う" sub="年齢帯別に収入成長を自動反映"><Toggle value={p.useIncomeCoef} onChange={set("useIncomeCoef")} color={C.green}/></Row>
              {!p.useIncomeCoef&&<Row label="年上昇率"><Num value={p.myIncomeGrowth} onChange={set("myIncomeGrowth")} min={0} max={5} step={0.1} unit="%"/></Row>}
              <Row label="退職予定年齢"><Num value={p.myRetireAge} onChange={set("myRetireAge")} min={50} max={75} unit="歳"/></Row>
              <Row label="想定年金（年額）"><Num value={p.myPension} onChange={set("myPension")} min={0} max={400} step={5} unit="万円" width={80}/></Row>
              <Row label="退職金"><Num value={p.myRetireBonus} onChange={set("myRetireBonus")} min={0} max={5000} step={100} unit="万円" width={80}/></Row>
              <Row label="現在の現金・預金"><Num value={p.myCash} onChange={set("myCash")} min={0} max={9999} step={10} unit="万円" width={80}/></Row>
              <Row label="NISA積立枠 残高"><Num value={p.myNisaTsumiBalance} onChange={set("myNisaTsumiBalance")} min={0} max={600} step={10} unit="万円" width={80}/></Row>
              <Row label="NISA成長枠 残高"><Num value={p.myNisaGrowthBalance} onChange={set("myNisaGrowthBalance")} min={0} max={1200} step={10} unit="万円" width={80}/></Row>
            </Card>

            <Card>
              <SH title="配偶者" icon="💑" color={C.purple}/>
              <Row label="配偶者あり"><Toggle value={p.hasSpouse} onChange={set("hasSpouse")} color={C.purple}/></Row>
              {p.hasSpouse&&(
                <div>
                  <Row label="年齢"><Num value={p.spouseAge} onChange={set("spouseAge")} min={20} max={70} unit="歳" color={C.purple}/></Row>
                  <Row label="手取り年収"><Num value={p.spouseTakeHome} onChange={set("spouseTakeHome")} min={0} max={2000} step={10} unit="万円" width={80} color={C.purple}/></Row>
                  {/* ② 配偶者にも変動係数 */}
                  <Row label="FP標準変動係数を使う" sub="配偶者の収入成長に自動反映"><Toggle value={p.spouseUseIncomeCoef} onChange={set("spouseUseIncomeCoef")} color={C.purple}/></Row>
                  {!p.spouseUseIncomeCoef&&<Row label="年上昇率"><Num value={p.spouseIncomeGrowth} onChange={set("spouseIncomeGrowth")} min={0} max={5} step={0.1} unit="%" color={C.purple}/></Row>}
                  <Row label="退職予定年齢"><Num value={p.spouseRetireAge} onChange={set("spouseRetireAge")} min={50} max={75} unit="歳" color={C.purple}/></Row>
                  <Row label="想定年金（年額）"><Num value={p.spousePension} onChange={set("spousePension")} min={0} max={300} step={5} unit="万円" width={80} color={C.purple}/></Row>
                  <Row label="退職金"><Num value={p.spouseRetireBonus} onChange={set("spouseRetireBonus")} min={0} max={5000} step={100} unit="万円" width={80} color={C.purple}/></Row>
                  <Row label="現在の現金・預金"><Num value={p.spouseCash} onChange={set("spouseCash")} min={0} max={9999} step={10} unit="万円" width={80} color={C.purple}/></Row>
                  <Row label="NISA積立枠 残高"><Num value={p.spouseNisaTsumiBalance} onChange={set("spouseNisaTsumiBalance")} min={0} max={600} step={10} unit="万円" width={80} color={C.purple}/></Row>
                  <Row label="NISA成長枠 残高"><Num value={p.spouseNisaGrowthBalance} onChange={set("spouseNisaGrowthBalance")} min={0} max={1200} step={10} unit="万円" width={80} color={C.purple}/></Row>
                  <SH title="収入調整期間（育休・時短等）" icon="⏸️" color={C.orange}/>
                  <Row label="設定する"><Toggle value={p.spouseAdjEnabled} onChange={set("spouseAdjEnabled")} color={C.orange}/></Row>
                  {p.spouseAdjEnabled&&(
                    <div>
                      <Row label="開始年"><Num value={p.spouseAdjStart} onChange={set("spouseAdjStart")} min={BASE_YEAR} max={2060} unit="年" color={C.orange}/></Row>
                      <Row label="終了年"><Num value={p.spouseAdjEnd} onChange={set("spouseAdjEnd")} min={BASE_YEAR} max={2060} unit="年" color={C.orange}/></Row>
                      <Row label="収入割合（0%=育休）"><Num value={p.spouseAdjRatio} onChange={set("spouseAdjRatio")} min={0} max={100} step={5} unit="%" color={C.orange}/></Row>
                      <div style={{background:"#FFF7ED",borderRadius:8,padding:"8px 10px",margin:"6px 0",fontSize:11,color:"#92400E"}}>
                        {p.spouseAdjStart}〜{p.spouseAdjEnd}年: 約{Math.round(p.spouseTakeHome*p.spouseAdjRatio/100)}万円/年
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* ① 子供2人以上対応 */}
            <Card>
              <SH title="子ども・寿命" icon="👶" color={C.yellow}/>
              <Row label="子どもの人数">
                <div style={{display:"flex",gap:6}}>
                  {[0,1,2,3,4].map(n=>(
                    <button key={n} onClick={()=>{
                      const cur=p.children||[];
                      const next=n>cur.length?[...cur,...Array(n-cur.length).fill(null).map(()=>({age:0}))]:(cur.slice(0,n));
                      setP(prev=>({...prev,childCount:n,children:next}));
                    }} style={{padding:"8px 12px",borderRadius:16,border:`2px solid ${p.childCount===n?C.yellow:C.border}`,background:p.childCount===n?C.yellow:"#fff",color:p.childCount===n?"#fff":C.muted,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {n===0?"なし":`${n}人`}
                    </button>
                  ))}
                </div>
              </Row>
              {(p.children||[]).map((c,i)=>(
                <Row key={i} label={`第${i+1}子の年齢`}><Num value={c.age} onChange={v=>updateChild(i,"age",v)} min={0} max={18} unit="歳" color={C.yellow}/></Row>
              ))}
              <Row label="想定寿命"><Num value={p.lifeExpectancy} onChange={set("lifeExpectancy")} min={75} max={100} unit="歳"/></Row>
            </Card>
          </div>
        )}

        {/* ══ STEP 2 ══ */}
        {step===2&&(
          <div>
            <div style={{background:"linear-gradient(135deg,#065F46,#10B981)",borderRadius:16,padding:20,marginBottom:16,color:"#fff"}}>
              <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>💸 収支</div>
              <div style={{fontSize:12,opacity:0.8}}>年額で入力（月額×12でOK）</div>
              <div style={{fontSize:20,fontWeight:800,marginTop:12}}>
                年間支出合計: <span style={{color:"#FDE68A"}}>{Math.round(p.food+p.daily+p.utility+p.comm+p.transport+p.leisure+p.insurance+p.clothing+p.medical+p.other+(p.hasCarMaint?(p.carGasoline+p.carTax+p.carInsurance):0)).toLocaleString()}万円</span>
              </div>
            </div>

            <Card color={C.accent+"40"}>
              <SH title="住まいのタイプ" icon="🏠" color={C.accent}/>
              <div style={{display:"flex",gap:10,paddingTop:8,paddingBottom:8}}>
                {[["rent","🏢 賃貸"],["own","🏡 持ち家（既に保有）"]].map(([v,l])=>(
                  <button key={v} onClick={()=>set("housingType")(v)} style={{flex:1,padding:"12px 8px",borderRadius:12,border:`2px solid ${p.housingType===v?C.accent:C.border}`,background:p.housingType===v?C.accent:"#fff",color:p.housingType===v?"#fff":C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
              {p.housingType==="own"&&<div style={{fontSize:11,color:C.muted,paddingBottom:8}}>持ち家の詳細はSTEP4で設定してください</div>}
            </Card>

            {p.housingType==="rent"&&(
              <Card color={C.green+"40"}>
                <SH title="家賃（期間別・年額）" icon="💴" color={C.green}/>
                {(p.rentSegments||[{amount:120}]).map((seg,i)=>{
                  const segs=p.rentSegments||[{amount:120}];
                  const isLast=i===segs.length-1;
                  const prevEnd=i===0?BASE_YEAR-1:(segs[i-1].endYear||BASE_YEAR);
                  const lbl=isLast?`${prevEnd+1}年〜`:`${prevEnd+1}〜${seg.endYear}年`;
                  return (
                    <div key={i} style={{background:"#F8FAFC",borderRadius:10,padding:"10px 12px",marginBottom:8,border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.green}}>期間{i+1}: {lbl}</span>
                        {segs.length>1&&<button onClick={()=>removeSeg(i)} style={{background:"#FEF2F2",border:"none",borderRadius:6,padding:"3px 8px",color:C.red,cursor:"pointer",fontSize:11}}>削除</button>}
                      </div>
                      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                        {!isLast&&<div><div style={{fontSize:10,color:C.muted,marginBottom:3}}>この期間の終わり</div><Num value={seg.endYear||BASE_YEAR+4} onChange={v=>updateSeg(i,"endYear",v)} min={BASE_YEAR} max={2060} unit="年まで" color={C.green} width={64}/></div>}
                        <div><div style={{fontSize:10,color:C.muted,marginBottom:3}}>家賃（年額）</div><Num value={seg.amount||0} onChange={v=>updateSeg(i,"amount",v)} min={0} max={360} step={6} unit="万円" color={C.green} width={72}/></div>
                      </div>
                    </div>
                  );
                })}
                <button onClick={addSeg} style={{width:"100%",padding:10,borderRadius:10,border:`2px dashed ${C.green}`,background:"#F0FDF4",color:C.green,fontWeight:700,fontSize:13,cursor:"pointer"}}>＋ 期間を追加</button>
              </Card>
            )}

            <Card>
              <SH title="食費・日用品・光熱費" icon="🛒" color={C.green}/>
              <Row label="食費（年額）"><Num value={p.food} onChange={set("food")} min={0} max={240} step={6} unit="万円" width={80}/></Row>
              <Row label="日用品（年額）"><Num value={p.daily} onChange={set("daily")} min={0} max={60} step={1} unit="万円" width={80}/></Row>
              <Row label="光熱費（年額）"><Num value={p.utility} onChange={set("utility")} min={0} max={60} step={1} unit="万円" width={80}/></Row>
              <SH title="通信・交通・レジャー" icon="🚃" color={C.yellow}/>
              <Row label="通信費（年額）"><Num value={p.comm} onChange={set("comm")} min={0} max={30} step={1} unit="万円" width={80}/></Row>
              <Row label="交通費（年額）"><Num value={p.transport} onChange={set("transport")} min={0} max={60} step={1} unit="万円" width={80}/></Row>
              <Row label="レジャー費（年額）"><Num value={p.leisure} onChange={set("leisure")} min={0} max={120} step={5} unit="万円" width={80}/></Row>
              <SH title="保険・医療・その他" icon="🏥" color={C.red}/>
              <Row label="保険料（年額）"><Num value={p.insurance} onChange={set("insurance")} min={0} max={150} step={1} unit="万円" width={80}/></Row>
              <Row label="被服費（年額）"><Num value={p.clothing} onChange={set("clothing")} min={0} max={60} step={1} unit="万円" width={80}/></Row>
              <Row label="医療費（年額）"><Num value={p.medical} onChange={set("medical")} min={0} max={60} step={1} unit="万円" width={80}/></Row>
              <Row label="その他（年額）"><Num value={p.other} onChange={set("other")} min={0} max={100} step={1} unit="万円" width={80}/></Row>
            </Card>

            <Card color={C.orange+"30"}>
              <SH title="車の維持費" icon="🚗" color={C.orange}/>
              <Row label="車を保有している"><Toggle value={p.hasCarMaint} onChange={set("hasCarMaint")} color={C.orange}/></Row>
              {p.hasCarMaint&&(
                <div>
                  <Row label="車をやめる年齢" sub="設定しない場合は生涯発生">
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Toggle value={!!p.carEndAge} onChange={v=>setP(prev=>({...prev,carEndAge:v?(prev.myAge+20):null}))} color={C.orange}/>
                  {!!p.carEndAge&&<Num value={p.carEndAge} onChange={set("carEndAge")} min={p.myAge+1} max={100} unit="歳から不要" color={C.orange} width={52}/>}
                </div>
              </Row>
              <Row label="ガソリン代（年額）"><Num value={p.carGasoline} onChange={set("carGasoline")} min={0} max={60} step={1} unit="万円" width={72} color={C.orange}/></Row>
                  <Row label="自動車税（年額）"><Num value={p.carTax} onChange={set("carTax")} min={0} max={20} step={1} unit="万円" width={72} color={C.orange}/></Row>
                  <Row label="任意保険（年額）"><Num value={p.carInsurance} onChange={set("carInsurance")} min={0} max={30} step={1} unit="万円" width={72} color={C.orange}/></Row>
                  <div style={{background:"#FFF7ED",borderRadius:8,padding:"8px 10px",marginTop:6,marginBottom:12,fontSize:11,color:"#92400E"}}>毎年の車維持費: {(p.carGasoline+p.carTax+p.carInsurance).toLocaleString()}万円/年</div>
                  <SH title="定期出費（車検・タイヤ等）" icon="🔧" color={C.muted}/>
                  {(p.recurringEvents||[]).map(ev=>(
                    <div key={ev.id} style={{background:"#FFF7ED",borderRadius:10,padding:"10px 12px",marginBottom:8,border:`1px solid ${C.orange}30`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <input value={ev.name} onChange={e=>updateRecurring(ev.id,"name",e.target.value)} style={{fontSize:12,fontWeight:700,border:"none",borderBottom:`1.5px solid ${C.orange}`,background:"transparent",outline:"none",color:C.dark,width:"60%"}}/>
                        <button onClick={()=>removeRecurring(ev.id)} style={{background:"#FEF2F2",border:"none",borderRadius:6,padding:"3px 8px",color:C.red,cursor:"pointer",fontSize:11}}>削除</button>
                      </div>
                      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                        <div><div style={{fontSize:9,color:C.muted,marginBottom:2}}>金額</div><Num value={ev.amount} onChange={v=>updateRecurring(ev.id,"amount",v)} min={1} max={200} step={1} unit="万円" color={C.orange} width={56}/></div>
                        <div><div style={{fontSize:9,color:C.muted,marginBottom:2}}>周期</div><Num value={ev.intervalYears} onChange={v=>updateRecurring(ev.id,"intervalYears",v)} min={1} max={10} step={1} unit="年おき" color={C.orange} width={40}/></div>
                        <div><div style={{fontSize:9,color:C.muted,marginBottom:2}}>初回</div><Num value={ev.startYear} onChange={v=>updateRecurring(ev.id,"startYear",v)} min={0} max={30} step={1} unit="年後" color={C.orange} width={40}/></div>
                      </div>
                    </div>
                  ))}
                  <button onClick={addRecurring} style={{width:"100%",padding:"8px",borderRadius:10,border:`2px dashed ${C.orange}`,background:"#FFF7ED",color:C.orange,fontWeight:700,fontSize:12,cursor:"pointer"}}>＋ 定期出費を追加</button>
                </div>
              )}
            </Card>

            {/* ③ 保育園・幼稚園（0〜5歳）に変更 */}
            {p.childCount>0&&(
              <Card color={C.yellow+"40"}>
                <SH title="教育費（年額・1人あたり）" icon="🎒" color={C.yellow}/>
                <Row label="保育園・幼稚園（0〜5歳）"><Num value={p.eduNursery} onChange={set("eduNursery")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow}/></Row>
                <Row label="小学校（6〜11歳）"><Num value={p.eduElementary} onChange={set("eduElementary")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow}/></Row>
                <Row label="中学校（12〜14歳）"><Num value={p.eduJunior} onChange={set("eduJunior")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow}/></Row>
                <Row label="高校（15〜17歳）"><Num value={p.eduHigh} onChange={set("eduHigh")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow}/></Row>
                <Row label="大学（18〜21歳）"><Num value={p.eduCollege} onChange={set("eduCollege")} min={0} max={200} step={5} unit="万円" width={80} color={C.yellow}/></Row>
              </Card>
            )}
          </div>
        )}

        {/* ══ STEP 3 ══ */}
        {step===3&&(
          <div>
            <div style={{background:"linear-gradient(135deg,#1E3A5F,#3B82F6)",borderRadius:16,padding:20,marginBottom:16,color:"#fff"}}>
              <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>📈 投資・資産形成</div>
              <div style={{fontSize:12,opacity:0.8}}>期間ごとに金額を自由に設定できます</div>
              <div style={{fontSize:18,fontWeight:800,marginTop:12}}>月間投資: <span style={{color:"#FDE68A"}}>{totalMonthlyInvest}万円</span></div>
            </div>

            {minusYears.length>0&&(
              <div style={{background:"rgba(239,68,68,0.1)",border:`1px solid ${C.red}40`,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:C.red,marginBottom:4}}>⚠️ 収支マイナスが{minusYears.length}年間あります</div>
                <div style={{fontSize:11,color:C.text}}>最大赤字 {Math.abs(Math.min(...minusYears.map(d=>d.cashFlow))).toLocaleString()}万円/年</div>
              </div>
            )}

            {/* ④ 自由な期間セグメント + ⑤ 満額達成通知 */}
            <Card color={C.green+"40"}>
              <SH title="本人 NISA" icon="📗" color={C.green}/>
              <div style={{background:"#F0FDF4",borderRadius:8,padding:"8px 10px",marginBottom:8,fontSize:11,color:C.green}}>💡 年間上限360万円（積立120万＋成長240万）/ 生涯上限 積立600万・成長1,200万</div>
              <div style={{marginTop:8}}>
                <div style={{fontSize:12,fontWeight:700,color:C.green,marginBottom:4}}>📌 積立投資枠（上限120万/年）</div>
                <SegEditor segs={p.myNisaTsumiSegs||[{endYear:null,annual:60}]} onChange={v=>set("myNisaTsumiSegs")(v)} max={120} step={6} color={C.green} label="積立枠"/>
                <Row label="積立枠 利回り"><Num value={p.myNisaTsumiReturn} onChange={set("myNisaTsumiReturn")} min={0} max={12} step={0.1} unit="%" color={C.green}/></Row>
                {myTsumiFullYear&&<div style={{background:"#DCFCE7",borderRadius:8,padding:"8px 10px",marginTop:6,fontSize:11,color:"#166534",fontWeight:700}}>🎉 {myTsumiFullYear}年に積立枠600万円が満額になります</div>}
              </div>
              <div style={{marginTop:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"#059669",marginBottom:4}}>📌 成長投資枠（上限240万/年）</div>
                <SegEditor segs={p.myNisaGrowthSegs||[{endYear:null,annual:0}]} onChange={v=>set("myNisaGrowthSegs")(v)} max={240} step={12} color="#059669" label="成長枠"/>
                <Row label="成長枠 利回り"><Num value={p.myNisaGrowthReturn} onChange={set("myNisaGrowthReturn")} min={0} max={15} step={0.1} unit="%" color="#059669"/></Row>
                {myGrowthFullYear&&<div style={{background:"#DCFCE7",borderRadius:8,padding:"8px 10px",marginTop:6,fontSize:11,color:"#166534",fontWeight:700}}>🎉 {myGrowthFullYear}年に成長枠1,200万円が満額になります</div>}
              </div>
            </Card>

            {p.hasSpouse&&(
              <Card color="#34D39940">
                <SH title="配偶者 NISA" icon="📗" color="#34D399"/>
                <div style={{marginTop:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#34D399",marginBottom:4}}>積立投資枠（上限120万/年）</div>
                  <SegEditor segs={p.spouseNisaTsumiSegs||[{endYear:null,annual:0}]} onChange={v=>set("spouseNisaTsumiSegs")(v)} max={120} step={6} color="#34D399" label="積立枠"/>
                  <Row label="積立枠 利回り"><Num value={p.spouseNisaTsumiReturn} onChange={set("spouseNisaTsumiReturn")} min={0} max={12} step={0.1} unit="%" color="#34D399"/></Row>
                  {spTsumiFullYear&&<div style={{background:"#DCFCE7",borderRadius:8,padding:"8px 10px",marginTop:6,fontSize:11,color:"#166534",fontWeight:700}}>🎉 {spTsumiFullYear}年に配偶者の積立枠600万円が満額になります</div>}
                </div>
                <div style={{marginTop:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#059669",marginBottom:4}}>成長投資枠（上限240万/年）</div>
                  <SegEditor segs={p.spouseNisaGrowthSegs||[{endYear:null,annual:0}]} onChange={v=>set("spouseNisaGrowthSegs")(v)} max={240} step={12} color="#059669" label="成長枠"/>
                  <Row label="成長枠 利回り"><Num value={p.spouseNisaGrowthReturn} onChange={set("spouseNisaGrowthReturn")} min={0} max={15} step={0.1} unit="%" color="#059669"/></Row>
                  {spGrowthFullYear&&<div style={{background:"#DCFCE7",borderRadius:8,padding:"8px 10px",marginTop:6,fontSize:11,color:"#166534",fontWeight:700}}>🎉 {spGrowthFullYear}年に配偶者の成長枠1,200万円が満額になります</div>}
                </div>
              </Card>
            )}

            <Card color={C.accent+"40"}>
              <SH title="本人 証券口座（特定口座）" icon="📈" color={C.accent}/>
              <SegEditor segs={p.myStockSegs||[{endYear:null,annual:0}]} onChange={v=>set("myStockSegs")(v)} max={600} step={12} color={C.accent} label="積立額"/>
              <Row label="開始年"><Num value={p.myStockStart} onChange={set("myStockStart")} min={2020} max={2060} unit="年"/></Row>
              <Row label="終了年"><Num value={p.myStockEnd} onChange={set("myStockEnd")} min={2025} max={2070} unit="年"/></Row>
              <Row label="想定利回り"><Num value={p.myStockReturn} onChange={set("myStockReturn")} min={0} max={15} step={0.1} unit="%"/></Row>
            </Card>

            {p.hasSpouse&&(
              <Card color="#93C5FD40">
                <SH title="配偶者 証券口座" icon="📈" color="#93C5FD"/>
                <SegEditor segs={p.spouseStockSegs||[{endYear:null,annual:0}]} onChange={v=>set("spouseStockSegs")(v)} max={600} step={12} color="#93C5FD" label="積立額"/>
                <Row label="開始年"><Num value={p.spouseStockStart} onChange={set("spouseStockStart")} min={2020} max={2060} unit="年" color="#93C5FD"/></Row>
                <Row label="終了年"><Num value={p.spouseStockEnd} onChange={set("spouseStockEnd")} min={2025} max={2070} unit="年" color="#93C5FD"/></Row>
                <Row label="想定利回り"><Num value={p.spouseStockReturn} onChange={set("spouseStockReturn")} min={0} max={15} step={0.1} unit="%" color="#93C5FD"/></Row>
              </Card>
            )}

            <Card>
              <SH title="現金・預金" icon="🏦" color={C.muted}/>
              <Row label="現金利回り（定期等）"><Num value={p.cashReturn} onChange={set("cashReturn")} min={0} max={3} step={0.1} unit="%"/></Row>
            </Card>

            {p.childCount>0&&(
              <Card color={C.yellow+"40"}>
                <SH title="こどもNISA（上限60万/年・1人）" icon="👶" color={C.yellow}/>
                <Row label="共通利回り"><Num value={p.kidNisaReturn} onChange={set("kidNisaReturn")} min={0} max={12} step={0.1} unit="%" color={C.yellow}/></Row>
                {p.childCount>=1&&(
                  <div style={{background:"#FFFBEB",borderRadius:10,padding:10,marginTop:8,border:`1px solid ${C.yellow}40`}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#92400E",marginBottom:4}}>👦 第1子</div>
                    <Row label="年額（上限60万）"><Num value={p.kid1NisaAnnual} onChange={set("kid1NisaAnnual")} min={0} max={60} step={1} unit="万円" width={72} color={C.yellow}/></Row>
                    <Row label="積立終了年"><Num value={p.kid1NisaEnd} onChange={set("kid1NisaEnd")} min={2025} max={2060} unit="年" color={C.yellow}/></Row>
                    <Row label="取崩し年"><Num value={p.kid1NisaWithdraw} onChange={set("kid1NisaWithdraw")} min={2025} max={2070} unit="年" color={C.yellow}/></Row>
                  </div>
                )}
                {p.childCount>=2&&(
                  <div style={{background:"#FEF9C3",borderRadius:10,padding:10,marginTop:8,border:`1px solid ${C.yellow}40`}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#713F12",marginBottom:4}}>👧 第2子</div>
                    <Row label="年額（上限60万）"><Num value={p.kid2NisaAnnual} onChange={set("kid2NisaAnnual")} min={0} max={60} step={1} unit="万円" width={72} color={C.yellow}/></Row>
                    <Row label="積立終了年"><Num value={p.kid2NisaEnd} onChange={set("kid2NisaEnd")} min={2025} max={2060} unit="年" color={C.yellow}/></Row>
                    <Row label="取崩し年"><Num value={p.kid2NisaWithdraw} onChange={set("kid2NisaWithdraw")} min={2025} max={2070} unit="年" color={C.yellow}/></Row>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ══ STEP 4 ══ */}
        {step===4&&(
          <div>
            <div style={{background:"linear-gradient(135deg,#78350F,#F59E0B)",borderRadius:16,padding:20,marginBottom:16,color:"#fff"}}>
              <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>🏠 不動産</div>
              <div style={{fontSize:12,opacity:0.8}}>購入・買替えの予定を入力します</div>
            </div>
            {p.housingType==="own"&&(
              <Card color={C.yellow+"40"}>
                <SH title="現在の持ち家" icon="🏡" color={C.yellow}/>
                <Row label="購入価格"><Num value={p.propertyInitialValue||0} onChange={set("propertyInitialValue")} min={0} max={20000} step={100} unit="万円" width={80} color={C.yellow}/></Row>
                <Row label="建築年"><Num value={p.propertyBuildYear||BASE_YEAR} onChange={set("propertyBuildYear")} min={1970} max={BASE_YEAR} unit="年" color={C.yellow}/></Row>
                <Row label="年間減価率" sub="木造:約2% / RC:約1%"><Num value={p.propertyDepreciationRate||1.5} onChange={set("propertyDepreciationRate")} min={0.5} max={5} step={0.1} unit="%" color={C.yellow}/></Row>
                <Row label="固定資産税を計算する"><Toggle value={p.propertyTaxEnabled} onChange={set("propertyTaxEnabled")} color={C.orange}/></Row>
                {p.propertyTaxEnabled&&<Row label="実効税率" sub="購入価格の0.1〜0.2%程度"><Num value={p.propertyTaxRate||0.14} onChange={set("propertyTaxRate")} min={0.05} max={0.5} step={0.01} unit="%" color={C.orange}/></Row>}
                {p.propertyTaxEnabled&&(p.propertyInitialValue||0)>0&&<div style={{background:"#FFF7ED",borderRadius:8,padding:"8px 10px",marginTop:6,fontSize:11,color:"#92400E",fontWeight:700}}>📋 初年度固定資産税目安: 約{Math.round((p.propertyInitialValue||0)*(p.propertyTaxRate||0.14)/100).toLocaleString()}万円/年</div>}
              </Card>
            )}
            <Card>
              <SH title="住宅購入・買替えの回数" icon="🏡" color={C.yellow}/>
              <div style={{display:"flex",gap:8,paddingTop:8}}>
                {[0,1,2,3].map(n=>(
                  <button key={n} onClick={()=>{
                    const cur=p.houses||[];
                    const next=n>cur.length?[...cur,...Array(n-cur.length).fill(null).map((_,i)=>({year:5+(i+cur.length)*10,cashPrice:0,loan:0,loanRate:1.5,loanYears:35,investWithdraw:0,investSource:"nisa",isCondo:false,manageFee:0,repairFee:0}))]:(cur.slice(0,n));
                    setP(prev=>({...prev,houses:next}));
                  }} style={{flex:1,padding:"10px 4px",borderRadius:10,border:`2px solid ${(p.houses||[]).length===n?C.yellow:C.border}`,background:(p.houses||[]).length===n?C.yellow:"#fff",color:(p.houses||[]).length===n?"#fff":C.muted,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    {n===0?"なし":`${n}回`}
                  </button>
                ))}
              </div>
            </Card>
            {(p.houses||[]).map((h,i)=>{
              const lm=h.loan>0?(h.loan*(h.loanRate/100/12)*Math.pow(1+h.loanRate/100/12,h.loanYears*12))/(Math.pow(1+h.loanRate/100/12,h.loanYears*12)-1):0;
              const col=houseColors[i]||C.yellow;
              const totalPrice=h.cashPrice+h.loan;
              // ⑥ 固定資産税年額計算
              const propTaxAnnual=totalPrice>0&&p.propertyTaxEnabled?Math.round(totalPrice*(p.propertyTaxRate||0.14)/100):0;
              return (
                <Card key={i} color={col+"40"}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:14}}>
                    <span style={{fontSize:13,fontWeight:800,color:col}}>{i===0?"🏠 第1回目の購入":i===1?"🏠 第2回目（買替え）":"🏠 第3回目（買替え）"}</span>
                    <button onClick={()=>removeHouse(i)} style={{background:"#FEF2F2",border:"none",borderRadius:6,padding:"4px 8px",color:C.red,cursor:"pointer",fontSize:11}}>削除</button>
                  </div>
                  <Row label="購入時期"><Num value={h.year} onChange={v=>updateHouse(i,"year",v)} min={0} max={40} unit="年後" color={col}/></Row>
                  <Row label="現金購入額" sub="0=現金購入なし"><Num value={h.cashPrice} onChange={v=>updateHouse(i,"cashPrice",v)} min={0} max={20000} step={100} unit="万円" width={80} color={col}/></Row>
                  <Row label="ローン借入額" sub="0=ローンなし"><Num value={h.loan} onChange={v=>updateHouse(i,"loan",v)} min={0} max={20000} step={100} unit="万円" width={80}/></Row>
                  {h.loan>0&&(
                    <div>
                      <Row label="金利（年率）"><Num value={h.loanRate} onChange={v=>updateHouse(i,"loanRate",v)} min={0.1} max={5} step={0.1} unit="%"/></Row>
                      <Row label="返済期間"><Num value={h.loanYears} onChange={v=>updateHouse(i,"loanYears",v)} min={10} max={35} unit="年"/></Row>
                      <div style={{background:"#EFF6FF",borderRadius:8,padding:"8px 12px",marginTop:6,fontSize:12,color:C.accent,fontWeight:700}}>月々の返済: 約{Math.round(lm).toLocaleString()}万円</div>
                    </div>
                  )}
                  {totalPrice>0&&(
                    <div>
                      <SH title="固定資産税・住居費" icon="📋" color={C.orange}/>
                      <Row label="固定資産税を計算する"><Toggle value={p.propertyTaxEnabled} onChange={set("propertyTaxEnabled")} color={C.orange}/></Row>
                      {p.propertyTaxEnabled&&<Row label="実効税率"><Num value={p.propertyTaxRate||0.14} onChange={set("propertyTaxRate")} min={0.05} max={0.5} step={0.01} unit="%" color={C.orange}/></Row>}
                      {p.propertyTaxEnabled&&propTaxAnnual>0&&<div style={{background:"#FFF7ED",borderRadius:8,padding:"8px 12px",marginTop:4,marginBottom:8,fontSize:12,color:"#92400E",fontWeight:700}}>📋 固定資産税: 初年度約{propTaxAnnual.toLocaleString()}万円/年（経年で逓減）</div>}
                      <Row label="年間減価率" sub="木造:約2% / RC:約1%"><Num value={p.propertyDepreciationRate||1.5} onChange={set("propertyDepreciationRate")} min={0.5} max={5} step={0.1} unit="%" color={C.orange}/></Row>
                      {/* ⑥ マンション: 管理費・修繕費 */}
                      <Row label="マンション（管理費・修繕費あり）"><Toggle value={h.isCondo||false} onChange={v=>updateHouse(i,"isCondo",v)} color={C.purple}/></Row>
                      {h.isCondo&&(
                        <div>
                          <Row label="管理費（月額）" sub="年額=月額×12"><Num value={Math.round((h.manageFee||0)/12)} onChange={v=>updateHouse(i,"manageFee",v*12)} min={0} max={10} step={0.5} unit="万円/月" color={C.purple} width={72}/></Row>
                          <Row label="修繕積立金（月額）"><Num value={Math.round((h.repairFee||0)/12)} onChange={v=>updateHouse(i,"repairFee",v*12)} min={0} max={10} step={0.5} unit="万円/月" color={C.purple} width={72}/></Row>
                          {((h.manageFee||0)+(h.repairFee||0))>0&&<div style={{background:"#F5F3FF",borderRadius:8,padding:"8px 12px",marginTop:4,fontSize:12,color:C.purple,fontWeight:700}}>管理費+修繕費: {((h.manageFee||0)+(h.repairFee||0)).toLocaleString()}万円/年</div>}
                        </div>
                      )}
                      <SH title="投資資産からの取崩し" icon="📤" color={C.purple}/>
                      <Row label="取崩し額"><Num value={h.investWithdraw} onChange={v=>updateHouse(i,"investWithdraw",v)} min={0} max={5000} step={50} unit="万円" width={80} color={C.purple}/></Row>
                      <Row label="取崩し元">
                        <div style={{display:"flex",gap:6}}>
                          {[["nisa","NISA"],["stock","証券"],["both","両方"]].map(([v,l])=>(
                            <button key={v} onClick={()=>updateHouse(i,"investSource",v)} style={{padding:"5px 10px",borderRadius:8,border:`2px solid ${h.investSource===v?C.purple:C.border}`,background:h.investSource===v?C.purple:"#fff",color:h.investSource===v?"#fff":C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>
                          ))}
                        </div>
                      </Row>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* ══ STEP 5 ══ */}
        {step===5&&(
          <div>
            <div style={{background:"linear-gradient(135deg,#4C1D95,#8B5CF6)",borderRadius:16,padding:20,marginBottom:16,color:"#fff"}}>
              <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>🎯 ライフイベント</div>
              <div style={{fontSize:12,opacity:0.8}}>大きな一時出費を登録します</div>
            </div>
            {(p.events||[]).map(ev=>(
              <div key={ev.id} style={{background:C.panel,borderRadius:12,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.purple}30`,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22,flexShrink:0}}>{ev.icon}</span>
                <div style={{flex:1}}>
                  <input value={ev.name} onChange={e=>setP(prev=>({...prev,events:prev.events.map(x=>x.id===ev.id?{...x,name:e.target.value}:x)}))}
                    style={{fontSize:13,fontWeight:700,border:"none",borderBottom:`1.5px solid ${C.purple}`,background:"transparent",outline:"none",color:C.dark,width:"100%",marginBottom:6}}/>
                  <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                    <div><div style={{fontSize:10,color:C.muted}}>発生時期</div><Num value={ev.year} onChange={v=>setP(prev=>({...prev,events:prev.events.map(x=>x.id===ev.id?{...x,year:v}:x)}))} min={0} max={50} unit="年後" color={C.purple} width={52}/></div>
                    <div><div style={{fontSize:10,color:C.muted}}>金額</div><Num value={ev.amount} onChange={v=>setP(prev=>({...prev,events:prev.events.map(x=>x.id===ev.id?{...x,amount:v}:x)}))} min={0} max={5000} step={10} unit="万円" color={C.purple} width={64}/></div>
                    <div style={{marginTop:14}}><div style={{fontSize:10,color:C.muted}}>{p.myAge+ev.year}歳・{BASE_YEAR+ev.year}年</div></div>
                  </div>
                </div>
                <button onClick={()=>setP(prev=>({...prev,events:prev.events.filter(e=>e.id!==ev.id)}))} style={{background:"#FEF2F2",border:"none",borderRadius:8,padding:"6px 8px",color:C.red,cursor:"pointer",fontSize:18,flexShrink:0}}>🗑</button>
              </div>
            ))}
            {(p.events||[]).length===0&&<div style={{textAlign:"center",padding:"30px 20px",color:C.muted,fontSize:13}}>まだイベントがありません</div>}
            <div style={{background:C.panel,borderRadius:14,padding:14,border:`2px dashed ${C.purple}40`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.purple,marginBottom:10}}>＋ カテゴリから追加</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {[{icon:"🚗",name:"車の購入",amt:300},{icon:"🔧",name:"車の買替",amt:200},{icon:"✈️",name:"旅行",amt:50},{icon:"🛋️",name:"家具・家電",amt:100},{icon:"🏥",name:"医療・介護",amt:200},{icon:"🎓",name:"教育費",amt:100},{icon:"💍",name:"冠婚葬祭",amt:100},{icon:"🖥️",name:"PC・機器",amt:30},{icon:"💰",name:"その他",amt:100}].map(cat=>(
                  <button key={cat.name} onClick={()=>setP(prev=>({...prev,events:[...(prev.events||[]),{id:Date.now(),name:cat.name,year:3,amount:cat.amt,icon:cat.icon}]}))} style={{padding:"10px 4px",borderRadius:10,border:`1.5px solid ${C.purple}30`,background:"#F5F3FF",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <span style={{fontSize:22}}>{cat.icon}</span>
                    <span style={{fontSize:10,fontWeight:700,color:C.purple}}>{cat.name}</span>
                    <span style={{fontSize:9,color:C.muted}}>{cat.amt}万〜</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ STEP 6 ══ */}
        {step===6&&(
          <div>
            {/* KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[
                {label:"退職時・総資産",value:`${Math.round(retireRow?.total??0).toLocaleString()}万円`,sub:`${p.myRetireAge}歳時点`,ok:(retireRow?.total??0)>0},
                {label:"資産ピーク",value:`${Math.round(peakTotal).toLocaleString()}万円`,sub:"最大蓄積額"},
                {label:crossZero?"資産枯渇年齢":"最終資産",value:crossZero?`${crossZero.age}歳`:`${Math.round(finalRow?.total??0).toLocaleString()}万円`,sub:crossZero?"早めの対策を":`${p.lifeExpectancy}歳時点`,warn:!!crossZero,ok:!crossZero&&(finalRow?.total??0)>0},
                {label:"月間投資（現在）",value:`${totalMonthlyInvest}万円`,sub:"NISA+証券合計"},
              ].map((k,i)=>(
                <div key={i} style={{background:C.panel,border:`1.5px solid ${k.warn?C.red:k.ok?C.green:C.border}`,borderRadius:14,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>{k.label}</div>
                  <div style={{fontSize:17,fontWeight:800,color:k.warn?C.red:k.ok?C.green:C.dark}}>{k.value}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ⑩ 自動アドバイス */}
            <div style={{marginBottom:16}}>
              {advice.map((a,i)=>(
                <div key={i} style={{background:adviceColors[a.type],border:`1px solid ${adviceBorders[a.type]}40`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:700,color:adviceBorders[a.type],marginBottom:4}}>{a.icon} {a.title}</div>
                  <div style={{fontSize:12,color:C.text,lineHeight:1.6}}>{a.body}</div>
                </div>
              ))}
            </div>

            {/* 資産推移グラフ */}
            <div style={{background:C.panel,borderRadius:16,padding:"14px 10px 10px",marginBottom:12,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:10,paddingLeft:4}}>📈 総資産推移</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data} margin={{top:14,right:4,left:-10,bottom:0}}>
                  <defs>
                    {[["gc",C.yellow],["gnt","#10B981"],["gng","#059669"],["gnt2","#34D399"],["gng2","#047857"],["gs",C.accent],["gs2","#93C5FD"],["gk1","#F59E0B"],["gk2","#FCD34D"],["gp","#94A3B8"]].map(([id,c])=>(
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={c} stopOpacity={0.7}/><stop offset="95%" stopColor={c} stopOpacity={0.05}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis {...xAx}/>
                  <YAxis tick={{fontSize:10,fill:C.muted}} tickFormatter={v=>`${Math.round(v/100)}百万`} width={46}/>
                  <Tooltip content={({active,payload,label})=>{
                    if(!active||!payload?.length) return null;
                    return(<div style={{background:C.dark,borderRadius:10,padding:"10px 14px",fontSize:12}}>
                      <div style={{color:"#93C5FD",fontWeight:700,marginBottom:6}}>{label}歳（{BASE_YEAR+label-p.myAge}年）</div>
                      {payload.filter(x=>x.value>0).map((x,i)=><div key={i} style={{color:x.color,marginBottom:2}}>{x.name}: <strong>{Math.round(x.value).toLocaleString()}万円</strong></div>)}
                    </div>);
                  }}/>
                  <ReferenceLine y={0} stroke={C.red} strokeWidth={1.5}/>
                  <ReferenceLine x={p.myRetireAge} stroke={C.yellow} strokeDasharray="5 3" label={{value:"退職",position:"top",fontSize:8,fill:C.yellow}}/>
                  <Area type="monotone" dataKey="cashAsset" name="現金" stroke={C.yellow} fill="url(#gc)" strokeWidth={1.5} dot={false} stackId="a"/>
                  <Area type="monotone" dataKey="myNisaTsumiAsset" name="本人NISA積立" stroke="#10B981" fill="url(#gnt)" strokeWidth={1.5} dot={false} stackId="a"/>
                  <Area type="monotone" dataKey="myNisaGrowthAsset" name="本人NISA成長" stroke="#059669" fill="url(#gng)" strokeWidth={1.5} dot={false} stackId="a"/>
                  {p.hasSpouse&&<Area type="monotone" dataKey="spNisaTsumiAsset" name="配偶者NISA積立" stroke="#34D399" fill="url(#gnt2)" strokeWidth={1.5} dot={false} stackId="a"/>}
                  {p.hasSpouse&&<Area type="monotone" dataKey="spNisaGrowthAsset" name="配偶者NISA成長" stroke="#047857" fill="url(#gng2)" strokeWidth={1.5} dot={false} stackId="a"/>}
                  <Area type="monotone" dataKey="myStockAsset" name="本人証券" stroke={C.accent} fill="url(#gs)" strokeWidth={1.5} dot={false} stackId="a"/>
                  {p.hasSpouse&&<Area type="monotone" dataKey="spStockAsset" name="配偶者証券" stroke="#93C5FD" fill="url(#gs2)" strokeWidth={1.5} dot={false} stackId="a"/>}
                  {p.childCount>=1&&<Area type="monotone" dataKey="kid1NisaAsset" name="子1NISA" stroke="#F59E0B" fill="url(#gk1)" strokeWidth={1.5} dot={false} stackId="a"/>}
                  {p.childCount>=2&&<Area type="monotone" dataKey="kid2NisaAsset" name="子2NISA" stroke="#FCD34D" fill="url(#gk2)" strokeWidth={1.5} dot={false} stackId="a"/>}
                  {(p.housingType==="own"||(p.houses||[]).length>0)&&<Area type="monotone" dataKey="propVal" name="不動産評価額" stroke="#94A3B8" fill="url(#gp)" strokeWidth={1.5} dot={false} stackId="a"/>}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ⑦ 収支グラフ（投資・一時出費・住居費も表示） */}
            <div style={{background:C.panel,borderRadius:16,padding:"14px 10px 10px",marginBottom:12,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:10,paddingLeft:4}}>💴 年間収支の内訳</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data} margin={{top:10,right:4,left:-10,bottom:0}} stackOffset="sign">
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis {...xAx}/>
                  <YAxis tick={{fontSize:10,fill:C.muted}} tickFormatter={v=>`${v}万`} width={46}/>
                  <Tooltip content={({active,payload,label})=>{
                    if(!active||!payload?.length) return null;
                    const row=data.find(d=>d.age===label);
                    return(<div style={{background:C.dark,borderRadius:10,padding:"10px 14px",fontSize:12,maxWidth:220}}>
                      <div style={{color:"#93C5FD",fontWeight:700,marginBottom:6}}>{label}歳（{BASE_YEAR+label-p.myAge}年）</div>
                      <div style={{color:C.green,marginBottom:2}}>収入: <strong>{(row?.income||0).toLocaleString()}万円</strong></div>
                      {payload.filter(x=>Math.abs(x.value)>0&&x.dataKey!=="income").map((x,i)=><div key={i} style={{color:x.fill,marginBottom:2}}>{x.name}: <strong>{Math.abs(Math.round(x.value)).toLocaleString()}万円</strong></div>)}
                    </div>);
                  }}/>
                  <ReferenceLine y={0} stroke="#fff" strokeWidth={1}/>
                  <ReferenceLine x={p.myRetireAge} stroke={C.yellow} strokeDasharray="5 3"/>
                  <Bar dataKey="income" name="収入" fill={C.green} stackId="pos" radius={[2,2,0,0]}/>
                  <Bar dataKey="negLiving" name="生活費" fill={C.red} stackId="neg"/>
                  <Bar dataKey="negOwn" name="住居費(税・管理)" fill={C.orange} stackId="neg"/>
                  <Bar dataKey="negInvest" name="投資" fill={C.accent} stackId="neg"/>
                  <Bar dataKey="negCar" name="車・定期" fill="#F97316" stackId="neg"/>
                  <Bar dataKey="negEvent" name="一時出費" fill={C.purple} stackId="neg"/>
                </BarChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:8,fontSize:10,flexWrap:"wrap"}}>
                <span style={{color:C.green,fontWeight:700}}>■ 収入</span>
                <span style={{color:C.red,fontWeight:700}}>■ 生活費</span>
                <span style={{color:C.orange,fontWeight:700}}>■ 住居費</span>
                <span style={{color:C.accent,fontWeight:700}}>■ 投資</span>
                <span style={{color:"#F97316",fontWeight:700}}>■ 車・定期</span>
                <span style={{color:C.purple,fontWeight:700}}>■ 一時出費</span>
              </div>
            </div>

            {/* ⑧ 保存・Excel出力・共有 */}
            <div style={{background:"linear-gradient(135deg,#1A2332,#0F2027)",borderRadius:16,padding:16,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#E2E8F0",marginBottom:10}}>💾 保存・出力・共有</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <button onClick={save} style={{padding:"12px 4px",borderRadius:10,border:"none",cursor:"pointer",background:"#7C3AED",color:"#fff",fontWeight:700,fontSize:12,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <span style={{fontSize:18}}>💾</span><span>保存</span>
                </button>
                {/* ⑨ 共有ボタン */}
                <button onClick={share} style={{padding:"12px 4px",borderRadius:10,border:"none",cursor:"pointer",background:"#0369A1",color:"#fff",fontWeight:700,fontSize:12,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <span style={{fontSize:18}}>🔗</span><span>URLで共有</span>
                </button>
              </div>
              <button onClick={()=>exportExcel(p,data)} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",cursor:"pointer",background:"#166834",color:"#fff",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <span style={{fontSize:18}}>📊</span> Excelエクスポート（サマリー＋年次内訳）
              </button>
              <div style={{fontSize:10,color:"#64748B",marginTop:8,textAlign:"center"}}>URLで共有すると別デバイスでも同じデータが開けます</div>
            </div>
          </div>
        )}

        {/* ナビゲーション */}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          {step>1&&<button onClick={()=>setStep(s=>s-1)} style={{flex:1,padding:14,borderRadius:12,border:`2px solid ${C.border}`,background:"#fff",color:C.text,fontSize:15,fontWeight:700,cursor:"pointer"}}>← 戻る</button>}
          {step<6&&<button onClick={()=>setStep(s=>s+1)} style={{flex:2,padding:14,borderRadius:12,border:"none",background:`linear-gradient(135deg,${C.accent},#2563EB)`,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>次へ →</button>}
          {step===6&&<button onClick={()=>setStep(1)} style={{flex:1,padding:14,borderRadius:12,border:`2px solid ${C.accent}`,background:"#fff",color:C.accent,fontSize:14,fontWeight:700,cursor:"pointer"}}>✏️ 設定を編集</button>}
        </div>
      </div>
    </div>
  );
}
