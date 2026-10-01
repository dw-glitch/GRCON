(function(root,factory){
  const api=factory(
    root.GrconN1710Catalog || (typeof require==="function"?require("./n1710_catalog.js"):null)
  );
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.GrconN1710Parser=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(Catalog){
"use strict";

const LANGUAGES=Object.freeze({
  I:"Inglês",
  A:"Alemão",
  F:"Francês",
  L:"Italiano",
  E:"Espanhol",
  D:"Outros idiomas",
});

const STATUS=Object.freeze({
  PASS:"pass",
  FAIL:"fail",
  INFO:"info",
  UNVERIFIED:"unverified",
});

function text(value){return String(value??"").trim();}
function upper(value){return text(value).toUpperCase();}
function check(id,status,message,meta){
  return Object.freeze({id,status,message,...(meta||{})});
}
function source(annex,section){
  const letter=upper(annex);
  const meta=Catalog&&Catalog.META&&Catalog.META.annexes&&Catalog.META.annexes[letter];
  return Object.freeze({
    norm:"N-1710",
    bodyRevision:Catalog?.META?.bodyRevision||"N",
    section:section||"",
    annex:letter||"",
    annexRevision:meta?.revision||"",
    annexEdition:meta?.edition||"",
  });
}

function splitActivity(raw){
  const value=upper(raw);
  if(!/^[0-9A-Z]{4,5}$/.test(value)) return {raw:value,base:"",differentiator:"",validShape:false};
  if(value.length===4) return {raw:value,base:value,differentiator:"",validShape:true};
  return {
    raw:value,
    base:value.slice(1),
    differentiator:value[0],
    validShape:/^[0-9]$/.test(value[0]),
  };
}

function parseSegments(input){
  const normalized=upper(input).replace(/\s+/g,"");
  const parts=normalized.split("-").filter(Boolean);
  if(parts.length!==6&&parts.length!==7){
    return {
      normalized,
      parts,
      language:"",
      category:"",
      installation:"",
      activity:"",
      serviceClass:"",
      origin:"",
      sequence:"",
      valid:false,
    };
  }
  const offset=parts.length===7?1:0;
  return {
    normalized,
    parts,
    language:offset?parts[0]:"",
    category:parts[offset],
    installation:parts[offset+1],
    activity:parts[offset+2],
    serviceClass:parts[offset+3],
    origin:parts[offset+4],
    sequence:parts[offset+5],
    valid:true,
  };
}

function evaluate(input,options){
  if(!Catalog)throw new Error("Catálogo N-1710 não carregado.");
  const opts=options||{};
  const parsed=parseSegments(input);
  const checks=[];

  if(!parsed.valid){
    checks.push(check(
      "n1710.structure.groups",
      STATUS.FAIL,
      `A codificação deve conter 6 grupos quando em português ou 7 quando o Grupo 0 de idioma estiver presente; foram encontrados ${parsed.parts.length}.`,
      {group:"estrutura",...source("", "5.1–5.2")}
    ));
    return finalize(parsed,checks);
  }

  checks.push(check(
    "n1710.structure.groups",
    STATUS.PASS,
    parsed.language?"Sete grupos identificados, incluindo Grupo 0 de idioma.":"Seis grupos explícitos identificados; Grupo 0 omitido para documento em português.",
    {group:"estrutura",...source("", "5.1–5.2")}
  ));

  if(parsed.language){
    const ok=Object.prototype.hasOwnProperty.call(LANGUAGES,parsed.language);
    checks.push(check(
      "n1710.group0.language",
      ok?STATUS.PASS:STATUS.FAIL,
      ok?`Grupo 0 ${parsed.language}: ${LANGUAGES[parsed.language]}.`:`Grupo 0 “${parsed.language}” não é um código de idioma previsto.`,
      {group:"0",value:parsed.language,...source("", "6.1.1–6.1.2")}
    ));
  }else{
    checks.push(check(
      "n1710.group0.language",
      STATUS.PASS,
      "Grupo 0 ausente: codificação tratada como documento em português.",
      {group:"0",value:"",...source("", "6.1.1")}
    ));
  }

  const categoryShape=/^[A-Z]{2}$/.test(parsed.category);
  checks.push(check(
    "n1710.group1.category.shape",
    categoryShape?STATUS.PASS:STATUS.FAIL,
    categoryShape?"Grupo 1 possui duas letras.":`Grupo 1 “${parsed.category}” deve possuir duas letras.`,
    {group:"1",value:parsed.category,...source("A","6.2.1–6.2.2")}
  ));
  if(categoryShape){
    const exists=Catalog.hasCategory(parsed.category);
    checks.push(check(
      "n1710.group1.category.catalog",
      exists?STATUS.PASS:STATUS.FAIL,
      exists?`Categoria ${parsed.category} localizada no Anexo A.`:`Categoria ${parsed.category} não localizada no Anexo A auditado.`,
      {group:"1",value:parsed.category,...source("A","6.2.1")}
    ));
  }

  const installationShape=/^\d{4}\.\d{2}$/.test(parsed.installation);
  checks.push(check(
    "n1710.group2.installation.shape",
    installationShape?STATUS.PASS:STATUS.FAIL,
    installationShape?"Grupo 2 segue CDDD.EE.":`Grupo 2 “${parsed.installation}” deve seguir o formato CDDD.EE.`,
    {group:"2",value:parsed.installation,...source("B","6.3.1–6.3.2")}
  ));
  if(installationShape){
    const exists=Catalog.hasInstallation(parsed.installation);
    checks.push(check(
      "n1710.group2.installation.catalog",
      exists?STATUS.PASS:STATUS.FAIL,
      exists?`Instalação ${parsed.installation} localizada no Anexo B.`:`Instalação ${parsed.installation} não localizada no Anexo B auditado.`,
      {group:"2",value:parsed.installation,...source("B","6.3.1")}
    ));
  }

  const fleet=installationShape&&parsed.installation.startsWith("48");
  const activityAnnex=fleet?"E":"C";
  const classAnnex=fleet?"F":"D";
  const activity=splitActivity(parsed.activity);
  checks.push(check(
    "n1710.group3.activity.shape",
    activity.validShape?STATUS.PASS:STATUS.FAIL,
    activity.validShape
      ?(activity.differentiator?`Grupo 3 usa diferenciador ${activity.differentiator} + área ${activity.base}.`:`Grupo 3 usa área ${activity.base} sem diferenciador.`)
      :`Grupo 3 “${parsed.activity}” deve conter GGGG ou FGGGG; quando presente, F deve ser algarismo.`,
    {group:"3",value:parsed.activity,annex:activityAnnex,...source(activityAnnex,"6.4.1–6.4.2.2")}
  ));
  if(activity.validShape){
    const exists=Catalog.hasActivity(activity.base,activityAnnex);
    checks.push(check(
      "n1710.group3.activity.catalog",
      exists?STATUS.PASS:STATUS.FAIL,
      exists
        ?`Área base ${activity.base} localizada no Anexo ${activityAnnex}${activity.differentiator?`; diferenciador operacional ${activity.differentiator} preservado`:""}.`
        :`Área base ${activity.base} não localizada no Anexo ${activityAnnex} auditado.`,
      {group:"3",value:parsed.activity,baseValue:activity.base,differentiator:activity.differentiator,annex:activityAnnex,...source(activityAnnex,"6.4.1")}
    ));
  }

  const classShape=/^[0-9A-Z]{3}$/.test(parsed.serviceClass);
  checks.push(check(
    "n1710.group4.class.shape",
    classShape?STATUS.PASS:STATUS.FAIL,
    classShape?"Grupo 4 possui três caracteres alfanuméricos.":`Grupo 4 “${parsed.serviceClass}” deve possuir três caracteres alfanuméricos.`,
    {group:"4",value:parsed.serviceClass,annex:classAnnex,...source(classAnnex,"6.5.1")}
  ));
  if(classShape&&activity.validShape){
    const exists=Catalog.hasClass(parsed.serviceClass,classAnnex,activity.base);
    checks.push(check(
      "n1710.group4.class.catalog",
      exists?STATUS.PASS:STATUS.FAIL,
      exists
        ?(fleet?`Classe ${parsed.serviceClass} localizada no Anexo F para a área ${activity.base}.`:`Classe ${parsed.serviceClass} localizada no Anexo D.`)
        :(fleet?`Classe ${parsed.serviceClass} não localizada no Anexo F para a área ${activity.base}.`:`Classe ${parsed.serviceClass} não localizada no Anexo D auditado.`),
      {group:"4",value:parsed.serviceClass,annex:classAnnex,activityBase:activity.base,...source(classAnnex,"6.5.1–6.5.2")}
    ));
  }

  const originShape=/^[0-9A-Z]{3}$/.test(parsed.origin);
  checks.push(check(
    "n1710.group5.origin.shape",
    originShape?STATUS.PASS:STATUS.FAIL,
    originShape?"Grupo 5 possui três caracteres alfanuméricos.":`Grupo 5 “${parsed.origin}” deve possuir três caracteres alfanuméricos.`,
    {group:"5",value:parsed.origin,...source("","6.6.1")}
  ));
  if(originShape){
    checks.push(check(
      "n1710.group5.origin.catalog",
      STATUS.UNVERIFIED,
      "A sintaxe do código de origem é válida, mas a existência do emitente depende do cadastro NORTEC/Código de Origem, que não faz parte dos anexos fornecidos.",
      {group:"5",value:parsed.origin,...source("","6.6.1, 6.6.4–6.6.5")}
    ));
  }

  const sequenceShape=/^\d{3,4}$/.test(parsed.sequence);
  checks.push(check(
    "n1710.group6.sequence",
    sequenceShape?STATUS.PASS:STATUS.FAIL,
    sequenceShape
      ?(parsed.sequence.length===4?"Sequencial de quatro algarismos aceito como exceção prevista para valores acima das centenas.":"Sequencial de três algarismos válido.")
      :`Grupo 6 “${parsed.sequence}” deve possuir três algarismos; quatro são admitidos excepcionalmente quando o sequencial ultrapassa as centenas.`,
    {group:"6",value:parsed.sequence,...source("","6.7")}
  ));

  if(fleet){
    checks.push(check(
      "n1710.annex.route",
      STATUS.PASS,
      "Instalação iniciada por 48: validação roteada para Anexos E (atividade) e F (classe), conforme regra da frota TRANSPETRO.",
      {group:"3–4",...source("E","6.4.1.1"),classAnnexRevision:Catalog.META.annexes.F.revision}
    ));
  }else{
    checks.push(check(
      "n1710.annex.route",
      STATUS.PASS,
      "Validação roteada para Anexos C (atividade) e D (classe).",
      {group:"3–4",...source("C","6.4.1.2"),classAnnexRevision:Catalog.META.annexes.D.revision}
    ));
  }

  if(opts.expectedCategory&&upper(opts.expectedCategory)!==parsed.category){
    checks.push(check(
      "n1710.context.category",
      STATUS.FAIL,
      `Categoria codificada ${parsed.category} diverge da categoria esperada ${upper(opts.expectedCategory)}.`,
      {group:"1",value:parsed.category,expected:upper(opts.expectedCategory),...source("A","6.2")}
    ));
  }

  return finalize(parsed,checks,{fleet,activityBase:activity.base,activityDifferentiator:activity.differentiator,activityAnnex,classAnnex});
}

function finalize(parsed,checks,extra){
  const failures=checks.filter(item=>item.status===STATUS.FAIL);
  const unverified=checks.filter(item=>item.status===STATUS.UNVERIFIED);
  const warnings=[];
  if(unverified.length)warnings.push("Há verificações dependentes de fonte externa aos anexos N-1710 fornecidos.");
  return Object.freeze({
    code:text(parsed.normalized),
    normalizedCode:text(parsed.normalized),
    groups:Object.freeze({
      language:parsed.language||"",
      category:parsed.category||"",
      installation:parsed.installation||"",
      activity:parsed.activity||"",
      serviceClass:parsed.serviceClass||"",
      origin:parsed.origin||"",
      sequence:parsed.sequence||"",
    }),
    valid:failures.length===0,
    fullyVerified:failures.length===0&&unverified.length===0,
    checks:Object.freeze(checks),
    errors:Object.freeze(failures.map(item=>item.message)),
    warnings:Object.freeze(warnings),
    ...(extra||{}),
  });
}

return Object.freeze({LANGUAGES,STATUS,splitActivity,parseSegments,evaluate});
});