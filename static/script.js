// =========================
// CONFIG
// =========================
const USE_PGFN = false; // deixe false enquanto não contratar a API da PGFN

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
  tela3: null,                                   // DASN-SIMEI (declaração anual)
  tela4: null,                                   // PGMEI (débitos DAS)
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

// Adiciona bolha com avatar (bot ou user)
function addMensagem(texto, autor = 'bot') {
  const clean = safeText(texto);
  if (!clean) return;

  const chat = document.getElementById('resultado');
  const div = document.createElement('div');
  div.className = autor === 'bot' ? 'msg-bot' : 'msg-user';
  const avatar = autor === 'bot' ? avatarBot : avatarUser;

  div.innerHTML = `
    <img src="${avatar}" class="avatar" alt="${autor}">
    <span>${clean}</span>
  `;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// --- Animação de digitação do bot ("...") ---
function startTyping() {
  const chat = document.getElementById('resultado');
  const wrap = document.createElement('div');
  wrap.className = 'msg-bot';
  wrap.innerHTML = `
    <img src="${avatarBot}" class="avatar" alt="bot">
    <span class="typing-dots">...</span>
  `;
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
// Helper: bot "digita" e depois envia a mensagem
async function botSay(texto, delay = 500) {
  const t = startTyping();
  await sleep(delay);
  stopTyping(t);
  addMensagem(texto, 'bot');
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

  // limpa chat
  chat.innerHTML = '';

  if (!cnpj || cnpj.length !== 14) {
    await botSay("Digite um CNPJ válido com 14 números.", 300);
    return;
  }

  // mostra mensagem do usuário com avatar
  addMensagem(input.value, 'user');

  // esconde input/botão
  input.style.display = 'none';
  botao.style.display = 'none';

  // spinner
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
      await botSay(data.erro, 300);
      // reexibe para nova tentativa
      input.style.display = '';
      botao.style.display = '';
      return;
    }

    ultimoCNPJ = input.value;
    window.dadosCNPJ = data;

    // NORMALIZAÇÕES/DEFAULTS para manter o fluxo até integrar tudo:
    const status = safeText(data.status || data.situacao || "");
    const simplesOptante = !!(data.simples_optante ?? data.simei?.optante ?? data.company?.simei?.optant);
    const dasnPendente   = !!(data.dasn_pendente ?? false);
    const dasAbertas     = Number(data.pgmei_total_em_aberto ?? 0);

    // Grava no diag
    window.diag.tela1 = { status: status || "—" };
    window.diag.tela3 = { dasn_pendente: dasnPendente };
    window.diag.tela4 = { das_em_aberto: dasAbertas };
    window.diag.tela5 = { simei_optante: simplesOptante };

    // mostra botões fixos (canto inferior direito)
    document.getElementById('btnDownload')?.classList.add('show');
    const btnReg = document.getElementById('btnRegularizar');
    if (btnReg) {
      btnReg.classList.add('show');
      btnReg.onclick = enviarWhatsApp; // garante ação correta
    }

    await iniciarConversa(data);

  } catch (err) {
    document.getElementById('loadingSpinner')?.remove();
    await botSay("Erro ao consultar dados. Tente novamente mais tarde.", 300);
    // reexibe entrada
    input.style.display = '';
    botao.style.display = '';
  }
}

// =========================
// FLUXO DE MENSAGENS
// =========================
function statusMensagem(status) {
  const s = (status || "").toLowerCase();
  if (s.includes('ativo'))  return "Situação cadastral: ativo.";
  if (s.includes('baixado'))return "Situação cadastral: baixado.";
  if (s.includes('inapto')) return "Situação cadastral: inapto.";
  return "Situação cadastral: não identificada.";
}

async function iniciarConversa(data) {
  if (safeText(data.responsavel)) await botSay(`Olá, ${safeText(data.responsavel)}.`);
  else                            await botSay("Olá.");

  if (window.diag.tela1?.status) await botSay(statusMensagem(window.diag.tela1.status));
  if (window.diag.tela5) {
    await botSay(`Enquadramento: ${window.diag.tela5.simei_optante ? "MEI (SIMEI)" : "desenquadrado do MEI"}.`);
  }
  if (window.diag.tela3) {
    await botSay(`Declaração Anual (DASN-SIMEI): ${window.diag.tela3.dasn_pendente ? "pendente" : "em dia"}.`);
  }
  if (window.diag.tela4) {
    await botSay(`Guias DAS em aberto: ${window.diag.tela4.das_em_aberto}.`);
  }

  // Observação: PGFN é pulado no chat (USE_PGFN = false). Vai para o PDF.

  // Botão "Continuar diagnóstico"
  mostrarOpcoes(["Continuar diagnóstico"], async () => {
    addMensagem("Continuar diagnóstico", "user");

    // Proposta automática (valores já atualizados)
    const proposta = gerarPropostaComBaseNoDiagnostico(window.diag);
    await botSay(`Proposta sugerida: ${proposta.titulo} — ${proposta.valor}`);
    await botSay("Você pode iniciar a regularização ou consultar um novo CNPJ.");

    mostrarBotoesFinais();
  });
}

function mostrarOpcoes(opcoes, callback) {
  const chat = document.getElementById('resultado');
  const div  = document.createElement('div');
  div.className = 'opcoes-botoes';

  opcoes.forEach(op => {
    const btn = document.createElement('button');
    btn.textContent = op;
    btn.classList.add('verde'); // verde no chat
    btn.onclick = () => { div.remove(); callback(op); };
    div.appendChild(btn);
  });

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function mostrarBotoesFinais() {
  const chat = document.getElementById('resultado');
  const div  = document.createElement('div');
  div.className = 'opcoes-botoes';
  div.style.display   = 'flex';
  div.style.gap       = '10px';
  div.style.marginTop = '10px';

  const d = window.dadosCNPJ || {};
  const p = gerarPropostaComBaseNoDiagnostico(window.diag);

  const msg = `Realizei o diagnóstico automático e quero regularizar.%0A` +
              `CNPJ: ${d.cnpj || ultimoCNPJ || ""}%0A` +
              `Status: ${window.diag.tela1?.status || ""}%0A` +
              `Proposta: ${p.titulo} — ${p.valor}`;

  const btnWhats = document.createElement('button');
  btnWhats.textContent = "Iniciar regularização";
  btnWhats.classList.add('verde'); // verde no final
  btnWhats.style.flex = "1";
  btnWhats.onclick = () => window.open(`https://wa.me/554396015785?text=${msg}`, '_blank');

  const btnNovo = document.createElement('button');
  btnNovo.textContent = "Consultar novo CNPJ";
  btnNovo.style.flex  = "1";
  btnNovo.onclick = () => location.reload();

  div.appendChild(btnWhats);
  div.appendChild(btnNovo);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// =========================
// PROPOSTA AUTOMÁTICA (R$ 399)
// =========================
function gerarPropostaComBaseNoDiagnostico(diag) {
  const VAL_UNIT = 399;
  const PARC_DUPLA = `2× de R$ ${VAL_UNIT}, total R$ ${VAL_UNIT*2}`;

  const status = (diag.tela1?.status || "").toLowerCase();
  const ativo   = status.includes("ativo");
  const inapto  = status.includes("inapto");
  const baixado = status.includes("baixado");

  const simei     = !!diag.tela5?.simei_optante;
  const dasnPend  = !!diag.tela3?.dasn_pendente;
  const dasAbert  = Number(diag.tela4?.das_em_aberto || 0);

  // 1) MEI ativo/inapto (continua MEI)
  if ((ativo || inapto) && simei) {
    return {
      keyword: "/PROPOSTA REGULARIZAR MEI",
      titulo:  "Regularização MEI",
      valor:   `R$ ${VAL_UNIT}`,
      corpo: [
        "Parcelamento das guias DAS em aberto.",
        "Entrega das declarações anuais (DASN-SIMEI) pendentes.",
        "Orientações para manter o CNPJ regular.",
        "Pagamento após confirmação com especialista. Pix/cartão (até 10x)."
      ],
      tipo: "MEI"
    };
  }

  // 2) Já baixado (foco dívida CPF)
  if (baixado) {
    return {
      keyword: "/PROPOSTA CNPJ JA BAIXADO",
      titulo:  "Negociação de dívida vinculada ao CPF (CNPJ baixado)",
      valor:   `R$ ${VAL_UNIT}`,
      corpo: [
        "Negociação e parcelamento prolongado da dívida vinculada ao CPF.",
        "Prevenção de protesto em cartório e outros agravamentos.",
        "Pagamento após negociação; Pix/cartão (até 10x)."
      ],
      tipo: "BAIXADO"
    };
  }

  // 3) Ativo desenquadrado do MEI (1ª fase de regularização MEI)
  if (ativo && !simei) {
    return {
      keyword: "/PROPOSTA REGUL ATIVO DESENQ",
      titulo:  "1ª fase – Regularização do período MEI",
      valor:   `R$ ${VAL_UNIT}`,
      corpo: [
        "Análise fiscal completa.",
        "Regularização de DAS em aberto do período MEI.",
        "Entrega de DASN-SIMEI em atraso.",
        "Orientações sobre o regime atual (SN/LP)."
      ],
      tipo: "ATIVO_DESENQ"
    };
  }

  // 4) Regularizar e baixar CNPJ desenquadrado (duas parcelas)
  if (!simei && (ativo || inapto)) {
    return {
      keyword: ativo ? "/PROPOSTA BAIXA ATIVO DESENQ" : (inapto ? "/PROPOSTA BAIXA INAPTO SN" : "/PROPOSTA BAIXA ATIVO DESENQ"),
      titulo:  "Regularizar e Baixar o CNPJ",
      valor:   PARC_DUPLA,
      corpo: [
        "Etapa 1 (R$ 399): Regularização MEI (DAS + DASN).",
        "Etapa 2 (R$ 399): Baixa no regime atual (SN/LP) na Receita e Junta.",
        "Prazo médio: ~15 dias úteis na 2ª etapa.",
        "Opção de parcelamento no cartão até 10x."
      ],
      tipo: "BAIXA"
    };
  }

  // fallback
  return {
    keyword: "PROPOSTA PADRÃO",
    titulo:  "Regularização Fiscal",
    valor:   `R$ ${VAL_UNIT}`,
    corpo: [
      "Regularização de pendências identificadas.",
      "Entrega de declarações necessárias.",
      "Orientações para manter o CNPJ regular."
    ],
    tipo: "PADRAO"
  };
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

  // 1) Fonte Roboto p/ acentos
  try {
    const fontUrl = "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf"; // Roboto-Regular.ttf
    const ab = await fetch(fontUrl).then(r => r.arrayBuffer());
    const b64 = btoa(
      Array.from(new Uint8Array(ab)).map(b => String.fromCharCode(b)).join("")
    );
    doc.addFileToVFS("Roboto-Regular.ttf", b64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto", "normal");
  } catch (e) {
    doc.setFont("helvetica", "normal");
  }

  // helper: remove emojis/char fora da fonte
  const sanitize = (s = "") =>
    String(s).replace(/[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/gu, "");

  const d = window.dadosCNPJ || {};
  const dataHora = new Date().toLocaleString("pt-BR");

  // 2) Cabeçalho com logo
  try {
    const logoUrl = "https://i.ibb.co/b5mX0Xnj/Logo-CNPJ-Legal.png";
    const logoBlob = await fetch(logoUrl).then(res => res.blob());
    const logoData = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(logoBlob);
    });
    doc.addImage(logoData, "PNG", 14, 10, 40, 15);
  } catch {}

  doc.setFontSize(16);
  doc.text(sanitize("Relatório Oficial - CNPJ Legal"), 60, 18);
  doc.setFontSize(10);
  doc.text(sanitize(`Gerado em: ${dataHora}`), 60, 24);
  doc.line(14, 28, 196, 28);

  // 3) Tabela cadastral mínima (somente o que faz sentido ao diagnóstico)
  const linhasCadastrais = [
    ["CNPJ", d.cnpj || ultimoCNPJ || "—"],
    ["Razão Social", d.razao_social || d.company?.name || "—"],
    ["Situação Cadastral", window.diag.tela1?.status || "—"],
    ["Enquadramento", window.diag.tela5?.simei_optante === true ? "MEI (SIMEI)" : (window.diag.tela5?.simei_optante === false ? "Desenquadrado do MEI" : "—")]
  ].map(([k, v]) => [sanitize(k), sanitize(String(v))]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: 34,
      head: [["Campo", "Informação"].map(sanitize)],
      body: linhasCadastrais,
      theme: "striped",
      headStyles: { fillColor: [15, 62, 250], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } },
    });
  } else {
    let y = 40;
    doc.setFontSize(11);
    linhasCadastrais.forEach(([k, v]) => {
      doc.text(`${k}: ${v}`, 14, y);
      y += 6;
    });
  }

  // 4) Resumo das 5 telas (inclui PGFN como "não consultado")
  const dsum = [
    ["T1 — Situação Cadastral (RFB)", window.diag.tela1?.status || "—"],
    ["T2 — Dívida Ativa (PGFN/CPF)", USE_PGFN ? (window.diag.tela2?.status || "—") : "Consulta não realizada nesta etapa"],
    ["T3 — Declaração Anual (DASN-SIMEI)", window.diag.tela3?.dasn_pendente === true ? "Pendente" : (window.diag.tela3?.dasn_pendente === false ? "Em dia" : "—")],
    ["T4 — Débitos DAS (PGMEI)", (window.diag.tela4?.das_em_aberto ?? "—")],
    ["T5 — Enquadramento (SIMEI/SN/LP)", window.diag.tela5?.simei_optante === true ? "MEI (SIMEI)" : (window.diag.tela5?.simei_optante === false ? "Desenquadrado do MEI" : "—")]
  ].map(([k, v]) => [sanitize(k), sanitize(String(v))]);

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

  // 5) Proposta Sugerida
  const prop = gerarPropostaComBaseNoDiagnostico(window.diag);
  let y2 = (doc.lastAutoTable?.finalY || 120) + 10;
  doc.setFontSize(14);
  doc.setTextColor(0,0,0);
  doc.text("Proposta Sugerida", 14, y2);

  y2 += 6;
  doc.setFontSize(11);
  doc.text(sanitize(`Título: ${prop.titulo}`), 14, y2);
  y2 += 6;
  doc.text(sanitize(`Investimento: ${prop.valor}`), 14, y2);
  y2 += 6;
  doc.text("Escopo:", 14, y2);
  y2 += 6;
  doc.setFontSize(10);
  const escopo = prop.corpo.map(i => `• ${i}`).join("\n");
  doc.text(doc.splitTextToSize(sanitize(escopo), 182), 14, y2);

  // 6) Chamada + botão WhatsApp (100% arredondado)
  const btnYBase = y2 + 22;
  doc.setFontSize(11);
  const desc = sanitize("Entre em contato pelo WhatsApp para avançarmos com a regularização.");
  doc.text(doc.splitTextToSize(desc, 182), 14, btnYBase);

  const btnY = btnYBase + 8;
  const btnX = 14;
  const btnW = 95;
  const btnH = 12;
  const radius = btnH / 2; // 100% arredondado

  doc.setFillColor(23, 227, 13);
  if (doc.roundedRect) {
    doc.roundedRect(btnX, btnY, btnW, btnH, radius, radius, "F");
  } else {
    doc.rect(btnX, btnY, btnW, btnH, "F");
  }
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(sanitize("Falar no WhatsApp"), btnX + 8, btnY + 8);

  const linkWhats = `https://wa.me/554396015785?text=${encodeURIComponent(
    "Quero regularizar meu CNPJ"
  )}`;
  doc.link(btnX, btnY, btnW, btnH, { url: linkWhats });

  // 7) Rodapé
  let fy = btnY + 22;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(sanitize("Instagram: @cnpjlegal"), 14, fy);
  fy += 5;
  doc.text(sanitize("Site oficial: www.cnpjlegal.com.br"), 14, fy);

  // 8) Salvar
  const nomeArq = `CNPJ_Legal_${(d.cnpj || ultimoCNPJ || "relatorio").replace(/\D/g,'')}.pdf`;
  doc.save(nomeArq);
}

// Expondo funções no escopo global (garantia para onclick do HTML)
window.consultarCNPJ = consultarCNPJ;
window.enviarWhatsApp = enviarWhatsApp;
window.baixarConversa = baixarConversa;
