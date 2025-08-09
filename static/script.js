// =========================
// CONFIG
// =========================
const USE_PGFN = false;

// =========================
// AVATARES
// =========================
const avatarBot  = "https://i.ibb.co/b5h1V8nd/i-cone.png";
const avatarUser = "https://i.ibb.co/8D2DQtrZ/icon-7797704-640.png";

// Estado global
let ultimoCNPJ = "";
window.dadosCNPJ = {};
window.userAnswers = { dasnResposta: "nao_sei" };

window.diag = {
  tela1: null,
  tela2: { status: USE_PGFN ? "PENDENTE" : "NAO_CONSULTADO", detalhes: null },
  tela3: null,
  tela4: null,
  tela5: null
};

// =========================
// UTIL
// =========================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (sel) => document.querySelector(sel);

function limparMascara(cnpj) {
  return (cnpj || "").replace(/\D/g, "");
}
function safeText(v) {
  return String(v == null ? "" : v).replace(/<[^>]*>?/g, "").trim();
}
function addHTML(html, autor) {
  const chat = $("#resultado");
  const row = document.createElement("div");
  row.className = autor === "user" ? "msg-user" : "msg-bot";
  row.innerHTML =
    '<img src="' + (autor === "user" ? avatarUser : avatarBot) + '" class="avatar" alt="' + (autor || "bot") + '">' +
    '<span>' + (html || "") + "</span>";
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}
function addMensagem(txt, autor) { addHTML(safeText(txt), autor); }

function startTyping() {
  const chat = $("#resultado");
  const wrap = document.createElement("div");
  wrap.className = "msg-bot";
  wrap.innerHTML =
    '<img src="' + avatarBot + '" class="avatar" alt="bot">' +
    '<span class="typing-dots">...</span>';
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;

  let dots = 3;
  const el = wrap.querySelector(".typing-dots");
  const itv = setInterval(() => {
    dots = dots === 3 ? 1 : dots + 1;
    el.textContent = ".".repeat(dots);
  }, 350);

  return { node: wrap, itv };
}
function stopTyping(t) {
  if (!t) return;
  clearInterval(t.itv);
  t.node.remove();
}
async function botSayHTML(html, delay) {
  const t = startTyping();
  await sleep(delay || 400);
  stopTyping(t);
  addHTML(html, "bot");
}
async function botSay(txt, delay) {
  await botSayHTML(safeText(txt), delay);
}

// =========================
// HERO chips -> focar input e dar dica
// =========================
function prepararHeroChips() {
  document.querySelectorAll(".card-item").forEach((chip) => {
    chip.style.cursor = "pointer";
    chip.addEventListener("click", () => {
      const input = $("#cnpjInput");
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
      const chat = $("#resultado");
      if (!chat.dataset.hintShown) {
        chat.dataset.hintShown = "1";
        botSayHTML("<b>Digite o CNPJ</b> no campo acima e clique em <b>Consultar</b> para começar o diagnostico.");
      }
    });
  });
}

// =========================
// Mascara CNPJ
// =========================
const cnpjEl = $("#cnpjInput");
if (cnpjEl) {
  cnpjEl.addEventListener("input", function (e) {
    let v = e.target.value.replace(/\D/g, "").slice(0, 14);
    if (v.length > 2)  v = v.replace(/(\d{2})(\d)/, "$1.$2");
    if (v.length > 6)  v = v.replace(/(\d{3})(\d)/, "$1.$2");
    if (v.length > 10) v = v.replace(/(\d{3})(\d)/, "$1/$2");
    if (v.length > 15) v = v.replace(/(\d{4})(\d)/, "$1-$2");
    e.target.value = v;
  });
}

// =========================
// Consulta
// =========================
async function consultarCNPJ() {
  const input = $("#cnpjInput");
  const botao = $("#consultarBtn");
  const chat  = $("#resultado");
  const cnpj = limparMascara(input.value);

  chat.innerHTML = "";

  if (!cnpj || cnpj.length !== 14) {
    await botSay("Digite um CNPJ valido com 14 numeros.");
    return;
  }

  addMensagem(input.value, "user");
  input.style.display = "none";
  botao.style.display = "none";

  const spinner = document.createElement("div");
  spinner.className = "spinner";
  spinner.id = "loadingSpinner";
  chat.appendChild(spinner);

  try {
    const res = await fetch("/consultar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj })
    });
    const data = await res.json();
    const sp = $("#loadingSpinner"); if (sp) sp.remove();

    if (data.erro) {
      await botSay(data.erro);
      input.style.display = "";
      botao.style.display = "";
      return;
    }

    ultimoCNPJ = input.value;
    window.dadosCNPJ = data;

    const status = safeText(data.status || data.situacao || "");
    const simplesOptante = !!(data.simples_optante || (data.simei && data.simei.optante) || (data.company && data.company.simei && data.company.simei.optant));

    window.diag.tela1 = { status: status || "-" };
    window.diag.tela3 = { dasn_pendente: null };
    window.diag.tela4 = { das_em_aberto: null };
    window.diag.tela5 = { simei_optante: simplesOptante };

    const btnD = $("#btnDownload"); if (btnD) btnD.classList.add("show");
    const btnR = $("#btnRegularizar"); if (btnR) btnR.classList.add("show");

    await iniciarConversa(data);

  } catch (err) {
    const sp = $("#loadingSpinner"); if (sp) sp.remove();
    await botSay("Erro ao consultar dados. Tente novamente mais tarde.");
    $("#cnpjInput").style.display = "";
    $("#consultarBtn").style.display = "";
  }
}

// =========================
// Fluxo
// =========================
function statusMensagem(status) {
  const s = (status || "").toLowerCase();
  if (s.indexOf("ativo") >= 0)   return "<b>Situacao cadastral:</b> ativo.";
  if (s.indexOf("baixado") >= 0) return "<b>Situacao cadastral:</b> baixado.";
  if (s.indexOf("inapto") >= 0)  return "<b>Situacao cadastral:</b> inapto.";
  return "<b>Situacao cadastral:</b> nao identificada.";
}

async function iniciarConversa(data) {
  if (safeText(data.responsavel)) await botSayHTML("Ola, <b>" + safeText(data.responsavel) + "</b>.");
  else await botSay("Ola.");

  if (window.diag.tela1 && window.diag.tela1.status) {
    await botSayHTML(statusMensagem(window.diag.tela1.status));
  }

  await botSayHTML(
    "<b>Divida ativa</b><br>" +
    "Devido ao nao pagamento das taxas mensais do seu CNPJ, a divida foi <b>transferida para o seu CPF</b>, tornando-se uma <b>divida ativa com a Receita Federal</b>.<br><br>" +
    "A divida ativa pode acarretar consequencias como:" +
    "<ul style=\"margin:8px 0 0 18px\">" +
    "<li>Bloqueio de contas bancarias</li>" +
    "<li>Bloqueio de maquininhas de cartao</li>" +
    "<li>Impedimento de emissao de notas fiscais</li>" +
    "<li>Penhora de bens</li>" +
    "<li>Inclusao em cadastros de inadimplentes (SPC/SERASA)</li>" +
    "<li>Envio da divida para cartorio</li>" +
    "</ul><br>" +
    "<b>Temos uma solucao:</b> E possivel conseguir <b>ate 50% de desconto</b> e <b>parcelar</b> o saldo restante <b>em ate 60 vezes</b>."
  );

  if (window.diag.tela5) {
    if (window.diag.tela5.simei_optante) {
      await botSayHTML(
        "<b>Enquadramento:</b> MEI (SIMEI).<br><br>" +
        "Boa noticia: seu CNPJ nao foi desenquadrado do MEI. Basta regularizar as pendencias para voltar a ficar regular."
      );
    } else {
      const st = (window.diag.tela1 && window.diag.tela1.status || "").toLowerCase();
      const base =
        "<b>Identificamos</b> que seu CNPJ foi <b>desenquadrado do MEI (SIMEI)</b> e agora esta no <b>Simples Nacional</b>.<br>" +
        "Implicacoes:" +
        "<ul style=\"margin:8px 0 0 18px\">" +
        "<li>Impostos sobre o faturamento (minimo 6% para servicos).</li>" +
        "<li>Declaracoes mensais e anuais do Simples sao obrigatorias; a falta gera multas.</li>" +
        "</ul>";
      if (st.indexOf("inapto") >= 0) {
        await botSayHTML("<b>Enquadramento:</b> desenquadrado do MEI (Simples Nacional) e o CNPJ esta <b>inapto</b>.<br><br>" + base);
      } else {
        await botSayHTML("<b>Enquadramento:</b> desenquadrado do MEI (Simples Nacional).<br><br>" + base);
      }
    }
  }

  await perguntarDASN();
}

async function perguntarDASN() {
  await botSayHTML("Sobre a <b>Declaracao Anual de Faturamento (DASN-SIMEI)</b> do ano passado, voce ja entregou?");
  mostrarOpcoes(
    [
      { label: "Ainda nao", value: "ainda_nao", classe: "verde" },
      { label: "Ja declarei", value: "ja_declarei" },
      { label: "Nao sei", value: "nao_sei" }
    ],
    async (val, label) => {
      addMensagem(label, "user");
      window.userAnswers.dasnResposta = val;

      if (val === "ainda_nao") {
        window.diag.tela3 = { dasn_pendente: true };
        const st = (window.diag.tela1 && window.diag.tela1.status || "").toLowerCase();
        if (st.indexOf("baixado") >= 0) {
          await botSayHTML("<b>Declaracao Anual:</b> <b>pendente</b> (declaracao especial de encerramento). Multa aproximada de R$ 50,00.");
        } else {
          await botSayHTML("<b>Declaracao Anual:</b> <b>pendente</b>. Multa aproximada de R$ 25,00.");
        }
      } else if (val === "ja_declarei") {
        window.diag.tela3 = { dasn_pendente: false };
        await botSayHTML("<b>Declaracao Anual:</b> em dia (sera validado por um especialista durante a regularizacao).");
      } else {
        window.diag.tela3 = { dasn_pendente: null };
        await botSayHTML("Vamos prosseguir; essa informacao sera conferida por um especialista e registrada no PDF.");
      }

      const proposta = montarPropostaCompleta(window.diag);
      await botSayHTML(proposta.previewMsg);

      await botSayHTML(
        "Para prosseguir, voce devera <b>efetuar o pagamento</b> assim que o processo for <b>concluido</b> e a situacao estiver <b>100% regularizada</b> — isso e concluido <b>hoje mesmo</b>. Se estiver ciente, clique em <b>Quero prosseguir</b>."
      );

      mostrarOpcoes(
        [
          { label: "Quero prosseguir", value: "ok", classe: "verde" },
          { label: "Consultar outro CNPJ", value: "novo" }
        ],
        async (v, l) => {
          addMensagem(l, "user");
          if (v === "ok") {
            await botSayHTML(proposta.docMensagemHTML);

            await botSayHTML("Voce possui o investimento <b>hoje</b> para pagamento apos a conclusao?");
            mostrarOpcoes(
              [
                { label: "Sim", value: "sim", classe: "verde" },
                { label: "Ainda nao", value: "nao" }
              ],
              async (v2, l2) => {
                addMensagem(l2, "user");
                if (v2 === "sim") {
                  mostrarOpcoes(
                    [{ label: "Continuar a regularizacao", value: "zap", classe: "verde" }],
                    () => {
                      enviarWhatsAppComContexto(proposta);
                      // depois de abrir o zap, mostra opcoes de fechamento
                      mostrarOpcoes(
                        [
                          { label: "Baixar Diagnostico (PDF)", value: "pdf", classe: "verde" },
                          { label: "Consultar novo CNPJ", value: "novo" }
                        ],
                        (v3) => {
                          if (v3 === "pdf") baixarConversa();
                          if (v3 === "novo") location.reload();
                        }
                      );
                    }
                  );
                } else {
                  mostrarOpcoes(
                    [
                      { label: "Baixar Diagnostico (PDF)", value: "pdf", classe: "verde" },
                      { label: "Consultar novo CNPJ", value: "novo" }
                    ],
                    (v3) => {
                      if (v3 === "pdf") baixarConversa();
                      if (v3 === "novo") location.reload();
                    }
                  );
                }
              }
            );
          } else {
            location.reload();
          }
        }
      );
    }
  );
}

function mostrarOpcoes(opcoes, onClick) {
  const chat = $("#resultado");
  const div  = document.createElement("div");
  div.className = "opcoes-botoes";

  opcoes.forEach((o) => {
    const btn = document.createElement("button");
    btn.textContent = o.label;
    if (o.classe === "verde") btn.classList.add("verde");
    btn.addEventListener("click", () => { div.remove(); onClick(o.value, o.label); });
    div.appendChild(btn);
  });

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// =========================
// Propostas
// =========================
function montarPropostaCompleta(diag) {
  const VAL = 399;
  const status = (diag.tela1 && diag.tela1.status || "").toLowerCase();
  const ativo   = status.indexOf("ativo") >= 0;
  const inapto  = status.indexOf("inapto") >= 0;
  const baixado = status.indexOf("baixado") >= 0;
  const simei   = !!(diag.tela5 && diag.tela5.simei_optante);

  if ((ativo || inapto) && simei) {
    const valor = "R$ " + VAL;
    const corpo =
      "<ul style=\"margin:8px 0 0 18px\">" +
      "<li>Parcelamento da Divida Ativa no CPF (buscando reducao e prazo longo).</li>" +
      "<li>Parcelamento das guias DAS em aberto no CNPJ.</li>" +
      "<li>Entrega das DASN-SIMEI pendentes.</li>" +
      "</ul>";
    const preview =
      "<b>Proposta:</b> Regularizacao MEI — <b>" + valor + "</b><br>" +
      "Servico inclui:" + corpo +
      "<br>Pagamento a vista (PIX/debito) ou em ate 10x no cartao.";
    const docs =
      "<b>Otimo!</b> Para iniciar, precisamos:<ul style=\"margin:8px 0 0 18px\">" +
      "<li>Nome da mae</li><li>Nome do pai</li><li>Data de nascimento</li><li>CPF</li></ul>" +
      "Envie digitado ou foto do RG/CNH. Apos recebermos, enviaremos as instrucoes para o pagamento do investimento inicial de <b>" + valor + "</b> (apos a negociacao da divida).";
    return { previewMsg: preview, docMensagemHTML: docs, tipo: "MEI" };
  }

  if (baixado) {
    const valor = "R$ " + VAL;
    const preview =
      "<b>Proposta:</b> Negociacao da divida no CPF (CNPJ baixado) — <b>" + valor + "</b>";
    const docs =
      "<b>Otimo!</b> Para iniciar a negociacao/parcelamento no CPF, precisamos:<ul style=\"margin:8px 0 0 18px\">" +
      "<li>Nome da mae</li><li>Nome do pai</li><li>Data de nascimento</li><li>CPF</li></ul>" +
      "Apos analise, enviaremos as instrucoes de pagamento de <b>" + valor + "</b>.";
    return { previewMsg: preview, docMensagemHTML: docs, tipo: "BAIXADO" };
  }

  if (ativo && !simei) {
    const valor = "R$ " + VAL;
    const preview =
      "<b>Proposta:</b> 1a fase — Regularizacao do periodo MEI — <b>" + valor + "</b><br>" +
      "<ul style=\"margin:8px 0 0 18px\">" +
      "<li>Analise fiscal completa</li>" +
      "<li>Regularizacao de DAS do periodo MEI</li>" +
      "<li>Entrega de DASN-SIMEI em atraso</li>" +
      "<li>Orientacao sobre o regime atual (SN/LP)</li>" +
      "</ul>";
    const docs =
      "<b>Otimo!</b> Para iniciar a 1a fase, precisamos:<ul style=\"margin:8px 0 0 18px\">" +
      "<li>Nome da mae</li><li>Nome do pai</li><li>Data de nascimento</li><li>CPF</li></ul>" +
      "Apos analise, enviaremos as instrucoes para pagamento de <b>" + valor + "</b>.";
    return { previewMsg: preview, docMensagemHTML: docs, tipo: "ATIVO_DESENQ" };
  }

  if (!simei && (ativo || inapto)) {
    const valor = "2x de R$ " + VAL + " (total R$ " + (VAL * 2) + ")";
    const preview =
      "<b>Proposta:</b> Regularizar e Baixar o CNPJ — <b>" + valor + "</b><br>" +
      "<ol style=\"margin:8px 0 0 18px\">" +
      "<li>R$ " + VAL + ": Regularizacao MEI (DAS + DASN)</li>" +
      "<li>R$ " + VAL + ": Baixa no regime atual (SN/LP)</li>" +
      "</ol>";
    const docs =
      "<b>Excelente!</b> Para iniciar o processo completo, precisamos:<ul style=\"margin:8px 0 0 18px\">" +
      "<li>CPF</li><li>Data de nascimento</li><li>Nome da mae</li><li>Nome do pai</li></ul>" +
      "Apos receber os dados, enviaremos as instrucoes para pagar a <b>1a parcela (R$ " + VAL + ")</b> apos a negociacao da Divida Ativa. A <b>2a parcela (R$ " + VAL + ")</b> e paga na conclusao da baixa.";
    return { previewMsg: preview, docMensagemHTML: docs, tipo: "BAIXA" };
  }

  const valor = "R$ " + VAL;
  return {
    previewMsg: "<b>Proposta:</b> Regularizacao Fiscal — <b>" + valor + "</b>",
    docMensagemHTML: "Para iniciar, envie: nome da mae, nome do pai, data de nascimento e CPF. Apos analise, enviamos as instrucoes de pagamento de <b>" + valor + "</b>.",
    tipo: "PADRAO"
  };
}

// =========================
// Acoes externas
// =========================
function enviarWhatsApp() {
  enviarWhatsAppComContexto(montarPropostaCompleta(window.diag));
}
function enviarWhatsAppComContexto(prop) {
  const d = window.dadosCNPJ || {};
  const texto =
    "Realizei o diagnostico e quero regularizar.\n" +
    "CNPJ: " + (d.cnpj || ultimoCNPJ || "") + "\n" +
    "Status: " + (window.diag.tela1 && window.diag.tela1.status || "") + "\n" +
    "Proposta: " + prop.previewMsg.replace(/<[^>]+>/g, "");
  window.open("https://wa.me/554396015785?text=" + encodeURIComponent(texto), "_blank");
}

// =========================
// PDF
// =========================
async function baixarConversa() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  try {
    const url = "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf";
    const ab = await fetch(url).then(r => r.arrayBuffer());
    const b64 = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(ab))));
    doc.addFileToVFS("Roboto-Regular.ttf", b64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto", "normal");
  } catch {
    doc.setFont("helvetica", "normal");
  }

  const sanitize = (s) => String(s || "").replace(/[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/gu, "");
  const d = window.dadosCNPJ || {};
  const dataHora = new Date().toLocaleString("pt-BR");

  try {
    const logoUrl = "https://i.ibb.co/b5mX0Xnj/Logo-CNPJ-Legal.png";
    const blob = await fetch(logoUrl).then(r => r.blob());
    const reader = new FileReader();
    const dataUrl = await new Promise(res => { reader.onloadend = () => res(reader.result); reader.readAsDataURL(blob); });
    doc.addImage(dataUrl, "PNG", 14, 10, 40, 15);
  } catch {}

  doc.setFontSize(16); doc.text("Relatorio Oficial - CNPJ Legal", 60, 18);
  doc.setFontSize(10); doc.text("Gerado em: " + sanitize(dataHora), 60, 24);
  doc.line(14, 28, 196, 28);

  const linhas = [
    ["CNPJ", d.cnpj || ultimoCNPJ || "-"],
    ["Razao Social", d.razao_social || (d.company && d.company.name) || "-"],
    ["Situacao Cadastral", (window.diag.tela1 && window.diag.tela1.status) || "-"],
    ["Enquadramento", (window.diag.tela5 && window.diag.tela5.simei_optante === true) ? "MEI (SIMEI)" :
                      ((window.diag.tela5 && window.diag.tela5.simei_optante === false) ? "Desenquadrado do MEI" : "-")]
  ].map(([k,v]) => [sanitize(k), sanitize(String(v))]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: 34,
      head: [["Campo", "Informacao"]],
      body: linhas,
      theme: "striped",
      headStyles: { fillColor: [15, 62, 250], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } }
    });
  }

  const dsum = [
    ["T1 — Situacao Cadastral (RFB)", (window.diag.tela1 && window.diag.tela1.status) || "-"],
    ["T2 — Divida Ativa (PGFN/CPF)", USE_PGFN ? ((window.diag.tela2 && window.diag.tela2.status) || "-") : "Consulta nao realizada nesta etapa"],
    ["T3 — Declaracao Anual (DASN-SIMEI)", window.userAnswers.dasnResposta === "ainda_nao" ? "Pendente" : (window.userAnswers.dasnResposta === "ja_declarei" ? "Em dia" : "Informado: nao sabe")],
    ["T4 — Debitos DAS (PGMEI)", "Nao avaliado automaticamente"],
    ["T5 — Enquadramento (SIMEI/SN/LP)", (window.diag.tela5 && window.diag.tela5.simei_optante === true) ? "MEI (SIMEI)" :
                                         ((window.diag.tela5 && window.diag.tela5.simei_optante === false) ? "Desenquadrado do MEI" : "-")]
  ];
  if (doc.autoTable) {
    doc.autoTable({
      startY: (doc.lastAutoTable && doc.lastAutoTable.finalY || 34) + 6,
      head: [["Etapa", "Resultado"]],
      body: dsum,
      theme: "striped",
      headStyles: { fillColor: [15, 62, 250], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 }
    });
  }

  const prop = montarPropostaCompleta(window.diag);
  let y = (doc.lastAutoTable && doc.lastAutoTable.finalY || 110) + 10;
  doc.setFontSize(14); doc.text("Proposta Sugerida", 14, y); y += 6;
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(sanitize(prop.previewMsg.replace(/<[^>]+>/g, "")), 182), 14, y);

  y += 16;
  doc.setFontSize(11);
  doc.text("Entre em contato pelo WhatsApp para avancarmos com a regularizacao.", 14, y);
  const btnY = y + 6, btnX = 14, btnW = 95, btnH = 12, radius = btnH / 2;
  doc.setFillColor(23, 227, 13);
  if (doc.roundedRect) doc.roundedRect(btnX, btnY, btnW, btnH, radius, radius, "F"); else doc.rect(btnX, btnY, btnW, btnH, "F");
  doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.text("Falar no WhatsApp", btnX + 8, btnY + 8);
  const link = "https://wa.me/554396015785?text=" + encodeURIComponent("Quero regularizar meu CNPJ");
  doc.link(btnX, btnY, btnW, btnH, { url: link });

  doc.setTextColor(100); doc.setFontSize(9);
  doc.text("Instagram: @cnpjlegal", 14, btnY + 22);
  doc.text("Site oficial: www.cnpjlegal.com.br", 14, btnY + 27);

  const nomeArq = "CNPJ_Legal_" + (String(d.cnpj || ultimoCNPJ || "relatorio").replace(/\D/g, "")) + ".pdf";
  doc.save(nomeArq);
}

// Expor no escopo global
window.consultarCNPJ = consultarCNPJ;
window.enviarWhatsApp = enviarWhatsApp;
window.baixarConversa = baixarConversa;

// Init
document.addEventListener("DOMContentLoaded", prepararHeroChips);
