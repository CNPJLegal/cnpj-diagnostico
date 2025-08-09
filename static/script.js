// =========================
// CONFIG
// =========================
const USE_PGFN = false; // deixamos desativado (pula Etapa 2 automática)

// =========================
// AVATARES
// =========================
const avatarBot  = "https://i.ibb.co/b5h1V8nd/i-cone.png";            // CNPJ Legal
const avatarUser = "https://i.ibb.co/8D2DQtrZ/icon-7797704-640.png";  // Usuário

// Estado global simples
let ultimoCNPJ = "";
window.dadosCNPJ = {};

// Estrutura consolidada das 5 telas do diagnóstico
window.diag = {
  tela1: null,                                   // Situação Cadastral (RFB/CNPJ)
  tela2: { status: USE_PGFN ? "PENDENTE" : "NAO_CONSULTADO", detalhes: null }, // PGFN/CPF
  tela3: { dasn_status: "NAO_PERGUNTADO" },      // DASN-SIMEI: "PENDENTE" | "EM_DIA" | "NAO_INFORMADO"
  tela4: { das_em_aberto: "INDETERMINADO" },     // PGMEI (ignoramos consulta automática)
  tela5: null                                    // SIMEI/Simples (enquadramento)
};

// =========================
// UTIL
// =========================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function limparMascara(cnpj) {
  return (cnpj || "").replace(/\D/g, "");
}
function safeText(v) {
  return String(v ?? "").replace(/<[^>]*>?/gm, "").trim();
}

// bolha + avatar
function addMensagem(texto, autor = 'bot') {
  const clean = safeText(texto);
  if (!clean) return;
  const chat = document.getElementById('resultado');
  const div = document.createElement('div');
  div.className = autor === 'bot' ? 'msg-bot' : 'msg-user';
  const avatar = autor === 'bot' ? avatarBot : avatarUser;
  div.innerHTML = `<img src="${avatar}" class="avatar" alt="${autor}"><span>${clean}</span>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function startTyping() {
  const chat = document.getElementById('resultado');
  const wrap = document.createElement('div');
  wrap.className = 'msg-bot';
  wrap.innerHTML = `<img src="${avatarBot}" class="avatar" alt="bot"><span class="typing-dots">...</span>`;
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;

  let dots = 3;
  const el = wrap.querySelector('.typing-dots');
  const itv = setInterval(() => {
    dots = dots === 3 ? 1 : dots + 1;
    el.textContent = '.'.repeat(dots);
  }, 350);

  return { node: wrap, itv };
}
function stopTyping(t) {
  if (!t) return;
  clearInterval(t.itv);
  t.node.remove();
}
async function botSay(texto, delay = 450) {
  const t = startTyping();
  await sleep(delay);
  stopTyping(t);
  addMensagem(texto, 'bot');
}

function mostrarBotoes(opcoes) {
  const chat = document.getElementById('resultado');
  const div  = document.createElement('div');
  div.className = 'opcoes-botoes';
  opcoes.forEach(({label, classe = '', onClick}) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (classe) btn.classList.add(classe);
    btn.onclick = () => { div.remove(); onClick && onClick(); };
    div.appendChild(btn);
  });
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// =========================
//// MÁSCARA CNPJ
// =========================
document.getElementById('cnpjInput')?.addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 14);
  if (v.length > 2)  v = v.replace(/(\d{2})(\d)/, '$1.$2');
  if (v.length > 6)  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  if (v.length > 10) v = v.replace(/(\d{3})(\d)/, '$1/$2');
  if (v.length > 15) v = v.replace(/(\d{4})(\d)/, '$1-$2');
  e.target.value = v;
});

// =========================
// CONSULTA
// =========================
async function consultarCNPJ() {
  const input = document.getElementById('cnpjInput');
  const botao = document.getElementById('consultarBtn');
  const chat  = document.getElementById('resultado');

  const cnpj = limparMascara(input.value);
  chat.innerHTML = '';

  if (!cnpj || cnpj.length !== 14) {
    await botSay("Digite um CNPJ válido com 14 números.");
    return;
  }

  addMensagem(input.value, 'user');
  input.style.display = 'none';
  botao.style.display = 'none';

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.id = 'loadingSpinner';
  chat.appendChild(spinner);

  try {
    const res = await fetch('/consultar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj })
    });
    const data = await res.json();
    document.getElementById('loadingSpinner')?.remove();

    if (data.erro) {
      await botSay(data.erro);
      input.style.display = '';
      botao.style.display = '';
      return;
    }

    ultimoCNPJ = input.value;
    window.dadosCNPJ = data;

    // NORMALIZAÇÕES
    const status = safeText(data.status || data.situacao || "");
    const simeiOptante = !!(data.simei?.optante ?? data.company?.simei?.optant ?? data.simples_optante);
    // Etapa 4: não chutamos 0 — deixamos INDETERMINADO
    window.diag.tela1 = { status: status || "—" };
    window.diag.tela5 = { simei_optante: simeiOptante };
    window.diag.tela4 = { das_em_aberto: "INDETERMINADO" };

    // mostra botões globais
    document.getElementById('btnDownload')?.classList.add('show');
    const btnReg = document.getElementById('btnRegularizar');
    if (btnReg) { btnReg.classList.add('show'); btnReg.onclick = enviarWhatsApp; }

    await fluxoDiagnostico();

  } catch (err) {
    document.getElementById('loadingSpinner')?.remove();
    await botSay("Erro ao consultar dados. Tente novamente mais tarde.");
    input.style.display = '';
    botao.style.display = '';
  }
}

// =========================
// ETAPAS DO DIAGNÓSTICO
// =========================
function textoT1(statusLower) {
  if (statusLower.includes('ativo')) {
    return "Confirmamos que seu CNPJ está **ativo** na Receita Federal. No entanto, identificamos a existência de guias de pagamento mensais **pendentes**.";
  }
  if (statusLower.includes('baixado')) {
    return "Seu CNPJ está **baixado** (encerrado) na Receita Federal. Mesmo com o CNPJ baixado, ainda existem **valores em aberto** que precisam ser regularizados.";
  }
  if (statusLower.includes('inapto')) {
    return "Seu CNPJ está **inapto** perante a Receita Federal devido a **pendências existentes**.";
  }
  return "Não foi possível identificar a situação cadastral com precisão neste momento.";
}

function textoT2_padrao() {
  return [
    "Devido ao não pagamento das taxas mensais do seu CNPJ, a dívida foi **transferida para o seu CPF**, tornando-se uma **dívida ativa com a Receita Federal**.",
    "",
    "A dívida ativa pode acarretar sérias consequências como:",
    "- Bloqueio de contas bancárias",
    "- Bloqueio de maquininhas de cartão",
    "- Impedimento de emissão de notas fiscais",
    "- Penhora de bens",
    "- Inclusão em cadastros de inadimplentes (SPC/SERASA)",
    "- Envio da dívida para cartório, gerando custos adicionais",
    "",
    "**Temos uma solução:** É possível conseguir **até 50% de desconto** e **parcelar o saldo restante em até 60 vezes**, facilitando a regularização e evitando que essas consequências ocorram."
  ].join("\n");
}

function textoT3_porResposta(resposta, statusLower) {
  // resposta: "AINDA_NAO" | "JA_DECLAREI" | "NAO_SEI"
  if (statusLower.includes('baixado')) {
    // TEXTO3DECLARACAOESPECIAL
    return "Adicionalmente, a **declaração anual especial de faturamento**, necessária devido ao encerramento do CNPJ, **não foi apresentada**. O prazo para essa entrega já se esgotou; existe a possibilidade de multa de **R$ 50**.";
  }
  if (resposta === "AINDA_NAO") {
    // TEXTO3 DECLARACAO ANUAL
    return "Também identifiquei que a **Declaração Anual de Faturamento** do seu CNPJ **está pendente**. A não entrega pode resultar em multa de aproximadamente **R$ 25,00**.";
  }
  if (resposta === "JA_DECLAREI") {
    return "A Declaração Anual de Faturamento **foi informada como entregue**. Um especialista do CNPJ Legal **validará essa informação** no processo de regularização.";
  }
  // NAO_SEI
  return "A situação da **Declaração Anual de Faturamento** não foi informada. Um especialista do CNPJ Legal **verificará isso** no processo de regularização.";
}

function textoT5(statusLower, simeiOpt) {
  if ((statusLower.includes('ativo') || statusLower.includes('inapto')) && simeiOpt === true) {
    // ENQUADRADO MEI
    return [
      "A notícia positiva é que seu CNPJ **não foi desenquadrado do MEI**. Precisamos apenas regularizar as pendências para retornar à situação regular.",
      "Lembre-se: se não regularizar, pode haver desenquadramento e migração para regimes com **impostos mais altos** e **mais burocracia**."
    ].join("\n\n");
  }
  if (statusLower.includes('ativo') && simeiOpt === false) {
    // DESENQ SIMPLES ATIVO
    return [
      "Identificamos que seu CNPJ foi **desenquadrado do MEI (SIMEI)** e agora está no **Simples Nacional**. Implicações:",
      "- Impostos calculados sobre o faturamento (mínimo **6%** para serviços).",
      "- **Declarações mensais e anuais** do Simples são obrigatórias; a falta gera **multas**."
    ].join("\n");
  }
  if (statusLower.includes('inapto') && simeiOpt === false) {
    // DESENQ SIMPLES INAPTO
    return [
      "Seu CNPJ está **inapto** e **desenquadrado do MEI**, estando no **Simples Nacional**. Implicações:",
      "- Impostos sobre o faturamento (mínimo **6%** para serviços).",
      "- Para regularizar e **permitir a baixa**, será necessário entregar as **declarações** do período em que esteve desenquadrado, mesmo sem movimento.",
      "- A falta de declarações gera **multas**."
    ].join("\n");
  }
  // Quando não é mais MEI nem Simples (LP) — precisamos inferir pelo texto de origem; aqui simplificamos:
  if (statusLower.includes('ativo') && simeiOpt === null) {
    return [
      "**Alerta importante!** Devido às pendências, o CNPJ está em regime **não MEI/fora do Simples (ex.: Lucro Presumido)**.",
      "Regime mais complexo: contador mensal, impostos mais altos (mínimo **13,33%** para serviços) e multas por declarações não entregues."
    ].join("\n");
  }
  if (statusLower.includes('inapto') && simeiOpt === null) {
    return [
      "**Alerta importante!** CNPJ **inapto** e fora do MEI/Simples (ex.: **Lucro Presumido**).",
      "Para regularizar e conseguir **baixar**, será necessário entregar declarações complexas (ex.: **DCTF, DCTFweb, ECF**), mesmo sem movimento. Impostos mais altos (mínimo **13,33%** para serviços)."
    ].join("\n");
  }
  // fallback
  return "Situação de enquadramento não identificada com precisão neste momento.";
}

// =========================
// FLUXO
// =========================
async function fluxoDiagnostico() {
  const status = (window.diag.tela1?.status || "").toLowerCase();
  const simei  = window.diag.tela5?.simei_optante;
  const nome   = safeText(window.dadosCNPJ?.responsavel || window.dadosCNPJ?.company?.name || "");

  await botSay(nome ? `Olá, ${nome}.` : "Olá.");

  // TELA 1 — Situação Cadastral
  await botSay(textoT1(status));

  // TELA 2 — Dívida Ativa (mensagem padrão)
  await botSay(textoT2_padrao());

  // TELA 3 — Perguntar DASN (Ativa/Inapta) | Baixada usa texto especial
  if (status.includes('baixado')) {
    await botSay(textoT3_porResposta("AINDA_NAO", "baixado")); // usa a “Declaração Especial” automaticamente
  } else {
    await perguntarDASN(status); // coleta “Ainda não / Já declarei / Não sei”
  }

  // TELA 4 — Ignorada (não consultamos). Mantemos INDETERMINADO na ficha/PDF.

  // TELA 5 — Enquadramento (mensagem por status + simei)
  await botSay(textoT5(status, simei === true ? true : (simei === false ? false : null)));

  // Proposta e CTA
  const proposta = gerarPropostaComBaseNoDiagnostico(window.diag);
  await botSay(`**Proposta sugerida:** ${proposta.titulo} — ${proposta.valor}`);
  await botSay(
    "Para prosseguir, você deverá **efetuar o pagamento assim que o processo for concluído e a situação estiver 100% regularizada**. " +
    "Todo esse processo é **concluído hoje mesmo**. Se estiver ciente e quiser continuar, clique em **Quero prosseguir**."
  );

  mostrarBotoes([
    { label: "Quero prosseguir", classe: "verde", onClick: async () => iniciarDocEWhatsapp(proposta) },
    { label: "Consultar outro CNPJ", onClick: () => location.reload() }
  ]);
}

async function perguntarDASN(statusLower) {
  await botSay("Sobre a **Declaração Anual de Faturamento (DASN-SIMEI)** do ano passado, você já entregou?");
  mostrarBotoes([
    { label: "Ainda não", onClick: async () => {
        window.diag.tela3.dasn_status = "PENDENTE";
        await botSay(textoT3_porResposta("AINDA_NAO", statusLower));
        fluxoContinuaDepoisDASN();
      }},
    { label: "Já declarei", onClick: async () => {
        window.diag.tela3.dasn_status = "EM_DIA";
        await botSay(textoT3_porResposta("JA_DECLAREI", statusLower));
        fluxoContinuaDepoisDASN();
      }},
    { label: "Não sei", onClick: async () => {
        window.diag.tela3.dasn_status = "NAO_INFORMADO";
        await botSay(textoT3_porResposta("NAO_SEI", statusLower));
        fluxoContinuaDepoisDASN();
      }},
  ]);
}

async function fluxoContinuaDepoisDASN() {
  // Apenas um placeholder pra manter a ordem do fluxo (T4 ignorado)
  // nada aqui — T5 é chamado pelo fluxo principal logo após a coleta
}

// =========================
// PROPOSTA AUTOMÁTICA (R$ 399 unit / 2x de 399 quando aplicável)
// =========================
function gerarPropostaComBaseNoDiagnostico(diag) {
  const VAL = 399;
  const DUAS_PARCELAS = `2× de R$ ${VAL}, total R$ ${VAL*2}`;

  const st = (diag.tela1?.status || "").toLowerCase();
  const ativo   = st.includes("ativo");
  const inapto  = st.includes("inapto");
  const baixado = st.includes("baixado");
  const simei   = diag.tela5?.simei_optante;

  // MEI ativo ou inapto (continua MEI)
  if ((ativo || inapto) && simei === true) {
    return {
      keyword: "/PROPOSTA REGULARIZAR MEI",
      titulo:  "Regularização MEI",
      valor:   `R$ ${VAL}`,
      docTipo: "SIMPLES", // para mensagem de documentos
      corpo: [
        "Parcelamento da Dívida Ativa no CPF (com redução e parcelamento prolongado).",
        "Parcelamento das guias DAS em aberto no CNPJ.",
        "Entrega das DASN-SIMEI pendentes."
      ]
    };
  }

  // CNPJ já baixado (foco na dívida do CPF)
  if (baixado) {
    return {
      keyword: "/PROPOSTA CNPJ JA BAIXADO",
      titulo:  "Negociação de dívida vinculada ao CPF (CNPJ baixado)",
      valor:   `R$ ${VAL}`,
      docTipo: "SIMPLES",
      corpo: [
        "Negociação/parcelamento prolongado da dívida do CPF.",
        "Prevenção de protesto/cartório e demais restrições."
      ]
    };
  }

  // Ativo desenquadrado do MEI (1ª fase – regularizar período MEI)
  if (ativo && simei === false) {
    return {
      keyword: "/PROPOSTA REGUL ATIVO DESENQ",
      titulo:  "1ª fase — Regularização do período MEI",
      valor:   `R$ ${VAL}`,
      docTipo: "SIMPLES",
      corpo: [
        "Análise fiscal completa.",
        "Regularização de DAS do período MEI.",
        "Entrega de DASN-SIMEI pendentes.",
        "Orientação inicial sobre o regime atual (SN/LP)."
      ]
    };
  }

  // Regularizar e baixar (duas parcelas)
  if (!simei && (ativo || inapto)) {
    return {
      keyword: ativo ? "/PROPOSTA BAIXA ATIVO DESENQ" : "/PROPOSTA BAIXA INAPTO SN",
      titulo:  "Regularizar e Baixar o CNPJ",
      valor:   DUAS_PARCELAS,
      docTipo: "COMPLETO",
      corpo: [
        "Etapa 1 (R$ 399): Regularização MEI (DAS + DASN).",
        "Etapa 2 (R$ 399): Baixa no regime atual (SN/LP) na Receita e Junta.",
        "Prazo médio da 2ª etapa: ~15 dias úteis."
      ]
    };
  }

  // Fallback padrão
  return {
    keyword: "PROPOSTA PADRÃO",
    titulo:  "Regularização Fiscal",
    valor:   `R$ ${VAL}`,
    docTipo: "SIMPLES",
    corpo: [
      "Regularização de pendências identificadas.",
      "Entrega de declarações necessárias.",
      "Orientações para manter o CNPJ regular."
    ]
  };
}

// =========================
// DOCS + CONFIRMAÇÃO + WHATSAPP
// =========================
async function iniciarDocEWhatsapp(proposta) {
  // Mensagem de documentação conforme tipo
  if (proposta.docTipo === "COMPLETO") {
    await botSay([
      "Excelente! Para iniciarmos o processo completo, precisamos:",
      "- CPF",
      "- Data de nascimento",
      "- Nome completo da mãe",
      "- Nome completo do pai",
      "Uma foto do RG ou CNH (frente e verso, se necessário) geralmente contém tudo."
    ].join("\n"));
    await botSay(
      "Após o envio, um especialista confirmará os detalhes e **solicitará o pagamento da primeira parte (R$ 399) somente após a negociação da Dívida Ativa**. " +
      "A segunda parcela é paga na conclusão do processo."
    );
  } else {
    await botSay([
      "Ótimo! Para darmos o primeiro passo, precisamos de:",
      "- Nome completo da mãe",
      "- Nome completo do pai",
      "- Data de nascimento",
      "- CPF",
      "Você pode enviar os dados digitados ou uma foto do RG/CNH (frente e verso, se necessário)."
    ].join("\n"));
    await botSay(
      "Após recebermos, um especialista confirmará os próximos passos e **solicitará o pagamento (R$ 399) somente após a conclusão do processo hoje mesmo**, com o CNPJ **100% regularizado**."
    );
  }

  // Confirmação final antes de abrir o Whats
  await botSay(
    "Se está **ciente** de que o pagamento será **efetuado após a conclusão hoje mesmo** e deseja prosseguir, clique abaixo:"
  );
  mostrarBotoes([
    { label: "Prosseguir no WhatsApp", classe: "verde", onClick: enviarWhatsApp },
    { label: "Consultar outro CNPJ", onClick: () => location.reload() }
  ]);
}

// =========================
// AÇÕES EXTERNAS
// =========================
function enviarWhatsApp() {
  const d = window.dadosCNPJ || {};
  const p = gerarPropostaComBaseNoDiagnostico(window.diag);
  const msg =
`Realizei o diagnóstico e quero regularizar.
CNPJ: ${d.cnpj || ultimoCNPJ || ""}
Status: ${window.diag.tela1?.status || ""}
Proposta: ${p.titulo} — ${p.valor}`;
  window.open(`https://wa.me/554396015785?text=${encodeURIComponent(msg)}`, '_blank');
}

// =========================
// PDF (Dossiê)
// =========================
async function baixarConversa() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Fonte
  try {
    const fontUrl = "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf";
    const ab = await fetch(fontUrl).then(r => r.arrayBuffer());
    const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
    doc.addFileToVFS("Roboto-Regular.ttf", b64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto", "normal");
  } catch { doc.setFont("helvetica", "normal"); }

  const sanitize = (s = "") => String(s).replace(/[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/gu, "");

  const d = window.dadosCNPJ || {};
  const dataHora = new Date().toLocaleString("pt-BR");

  // Logo + header
  try {
    const logoUrl = "https://i.ibb.co/b5mX0Xnj/Logo-CNPJ-Legal.png";
    const logoBlob = await fetch(logoUrl).then(res => res.blob());
    const logoData = await new Promise(r => { const fr = new FileReader(); fr.onloadend = () => r(fr.result); fr.readAsDataURL(logoBlob); });
    doc.addImage(logoData, "PNG", 14, 10, 40, 15);
  } catch {}

  doc.setFontSize(16);
  doc.text(sanitize("Relatório Oficial - CNPJ Legal"), 60, 18);
  doc.setFontSize(10);
  doc.text(sanitize(`Gerado em: ${dataHora}`), 60, 24);
  doc.line(14, 28, 196, 28);

  // Bloco cadastral mínimo
  const linhasCadastrais = [
    ["CNPJ", d.cnpj || ultimoCNPJ || "—"],
    ["Razão Social", d.razao_social || d.company?.name || "—"],
    ["Situação Cadastral", window.diag.tela1?.status || "—"],
    ["Enquadramento", window.diag.tela5?.simei_optante === true ? "MEI (SIMEI)" :
                      window.diag.tela5?.simei_optante === false ? "Desenquadrado do MEI" : "—"]
  ].map(([k,v]) => [sanitize(k), sanitize(String(v))]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: 34,
      head: [["Campo", "Informação"]],
      body: linhasCadastrais,
      theme: "striped",
      headStyles: { fillColor: [15,62,250], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } },
    });
  }

  // Resumo das 5 telas
  const dsum = [
    ["T1 — Situação Cadastral (RFB)", window.diag.tela1?.status || "—"],
    ["T2 — Dívida Ativa (PGFN/CPF)", USE_PGFN ? (window.diag.tela2?.status || "—") : "Mensagem padrão orientativa"],
    ["T3 — DASN-SIMEI", window.diag.tela3?.dasn_status === "PENDENTE" ? "Pendente" :
                        window.diag.tela3?.dasn_status === "EM_DIA" ? "Em dia (a confirmar)" :
                        window.diag.tela3?.dasn_status === "NAO_INFORMADO" ? "Não informado (a verificar)" : "—"],
    ["T4 — Débitos DAS (PGMEI)", "Indeterminado (não consultado automaticamente)"],
    ["T5 — Enquadramento (SIMEI/SN/LP)", window.diag.tela5?.simei_optante === true ? "MEI (SIMEI)" :
                                          window.diag.tela5?.simei_optante === false ? "Desenquadrado do MEI" : "—"]
  ].map(([k,v]) => [sanitize(k), sanitize(String(v))]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: (doc.lastAutoTable?.finalY || 34) + 6,
      head: [["Etapa", "Resultado"]],
      body: dsum,
      theme: "striped",
      headStyles: { fillColor: [15,62,250], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 }
    });
  }

  // Proposta
  const prop = gerarPropostaComBaseNoDiagnostico(window.diag);
  let y = (doc.lastAutoTable?.finalY || 120) + 10;
  doc.setFontSize(14);
  doc.text("Proposta Sugerida", 14, y); y += 6;
  doc.setFontSize(11);
  doc.text(sanitize(`Título: ${prop.titulo}`), 14, y); y += 6;
  doc.text(sanitize(`Investimento: ${prop.valor}`), 14, y); y += 6;
  doc.text("Escopo:", 14, y); y += 6;
  doc.setFontSize(10);
  const escopo = prop.corpo.map(i => `• ${i}`).join("\n");
  doc.text(doc.splitTextToSize(sanitize(escopo), 182), 14, y);

  // Botão WhatsApp verde com texto em negrito (visual no PDF)
  const btnY = y + 22;
  const btnX = 14, btnW = 95, btnH = 12, radius = btnH/2;
  doc.setFillColor(23, 227, 13);
  if (doc.roundedRect) doc.roundedRect(btnX, btnY, btnW, btnH, radius, radius, "F");
  else doc.rect(btnX, btnY, btnW, btnH, "F");
  doc.setTextColor(0,0,0);
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Falar no WhatsApp", btnX + 8, btnY + 8);
  doc.setFont(undefined, "normal");
  const linkWhats = `https://wa.me/554396015785?text=${encodeURIComponent("Quero regularizar meu CNPJ")}`;
  doc.link(btnX, btnY, btnW, btnH, { url: linkWhats });

  // Rodapé
  let fy = btnY + 22;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(sanitize("Instagram: @cnpjlegal"), 14, fy); fy += 5;
  doc.text(sanitize("Site oficial: www.cnpjlegal.com.br"), 14, fy);

  const nomeArq = `CNPJ_Legal_${(d.cnpj || ultimoCNPJ || "relatorio").replace(/\D/g,'')}.pdf`;
  doc.save(nomeArq);
}

// Expõe globais
window.consultarCNPJ = consultarCNPJ;
window.enviarWhatsApp = enviarWhatsApp;
window.baixarConversa = baixarConversa;
