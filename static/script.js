// =========================
// CONFIG
// =========================
const USE_PGFN = false;

// =========================
// AVATARES
// =========================
const avatarBot  = "https://i.ibb.co/b5h1V8nd/i-cone.png";
const avatarUser = "https://i.ibb.co/8D2DQtrZ/icon-7797704-640.png";

// =========================
// ESTADO GLOBAL
// =========================
let ultimoCNPJ = "";
window.dadosCNPJ = {};
window.userAnswers = { dasnResposta: "nao_sei" };

window.diag = {
  tela1: null,                                   // Situação cadastral
  tela2: { status: USE_PGFN ? "PENDENTE" : "NAO_CONSULTADO", detalhes: null }, // Dívida ativa (PGFN)
  tela3: null,                                   // DASN (pergunta ao usuário)
  tela4: null,                                   // DAS PGMEI (ignorado automático)
  tela5: null                                    // Enquadramento (MEI/SN/LP)
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
function stopTyping(t) { if (!t) return; clearInterval(t.itv); t.node.remove(); }
async function botSayHTML(html, delay) { const t = startTyping(); await sleep(delay||380); stopTyping(t); addHTML(html,"bot"); }
async function botSay(txt, delay) { await botSayHTML(safeText(txt), delay); }

// =========================
// HERO: chips -> foco no input + dica
// =========================
function prepararHeroChips() {
  document.querySelectorAll(".card-item").forEach(chip => {
    chip.style.cursor = "pointer";
    chip.addEventListener("click", () => {
      const input = $("#cnpjInput");
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
      const chat = $("#resultado");
      if (!chat.dataset.hintShown) {
        chat.dataset.hintShown = "1";
        botSayHTML("<b>Digite o CNPJ</b> no campo acima e clique em <b>Consultar</b> para começar o diagnóstico.");
      }
    });
  });
}

// =========================
// MÁSCARA
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
//// CONSULTA
// =========================
async function consultarCNPJ() {
  const input = $("#cnpjInput");
  const botao = $("#consultarBtn");
  const chat  = $("#resultado");
  const cnpj = limparMascara(input.value);

  chat.innerHTML = "";

  if (!cnpj || cnpj.length !== 14) { await botSay("Digite um CNPJ válido com 14 números."); return; }

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

    if (data.erro) { await botSay(data.erro); input.style.display=""; botao.style.display=""; return; }

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
    const sp2 = $("#loadingSpinner"); if (sp2) sp2.remove();
    await botSay("Erro ao consultar dados. Tente novamente mais tarde.");
    input.style.display=""; botao.style.display="";
  }
}

// =========================
// TEXTOS PADRÃO
// =========================
function textoSituacao(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("ativo")) {
    return "Confirmamos que seu CNPJ está <b>ativo</b> na Receita Federal. No entanto, identificamos a existência de <b>guias de pagamento mensais pendentes</b>.";
  }
  if (s.includes("baixado")) {
    return "Seu CNPJ está <b>baixado</b> (encerrado) na Receita Federal. Mesmo com o CNPJ baixado, ainda existem <b>valores em aberto</b> que precisam ser regularizados.";
  }
  if (s.includes("inapto")) {
    return "Seu CNPJ está <b>inapto</b> perante a Receita Federal devido a pendências existentes.";
  }
  return "<b>Situação cadastral</b>: não identificada.";
}

const TEXTO_DIVIDA_ATIVA = `
Devido ao não pagamento das taxas mensais do seu CNPJ, a dívida foi <b>transferida para o seu CPF</b>, tornando-se uma <b>dívida ativa com a Receita Federal</b>.<br><br>
A dívida ativa pode acarretar sérias consequências como:
<ul style="margin:8px 0 0 18px">
<li>Bloqueio de contas bancárias</li>
<li>Bloqueio de maquininhas de cartão</li>
<li>Impedimento de emissão de notas fiscais</li>
<li>Penhora de bens</li>
<li>Inclusão em cadastros de inadimplentes (SPC/SERASA)</li>
<li>Envio da dívida para cartório, gerando custos adicionais</li>
</ul><br>
<b>Temos uma solução:</b> É possível conseguir <b>até 50% de desconto</b> e <b>parcelar</b> o saldo restante <b>em até 60 vezes</b>, facilitando a regularização.
`;

// Enquadramento (passo 5)
const TXT_ENQ_MEI = `
A notícia positiva é que seu CNPJ <b>não foi desenquadrado do MEI</b>. Portanto, precisamos apenas regularizar as pendências para que o CNPJ retorne à situação regular.<br><br>
É importante lembrar que, se as pendências não forem resolvidas, o CNPJ pode ser desenquadrado do MEI e migrado para regimes com impostos mais altos e mais burocracia.
`;
const TXT_DESENQ_SN_ATIVO = `
Identificamos que seu CNPJ foi <b>desenquadrado do MEI (SIMEI)</b> e agora está enquadrado como <b>Simples Nacional</b>. Isso significa algumas mudanças:
<ul style="margin:8px 0 0 18px">
<li>Seus impostos agora são calculados sobre o faturamento, com uma <b>taxa mínima de 6%</b> para prestação de serviços.</li>
<li>É obrigatório entregar <b>declarações mensais e anuais</b> específicas do Simples Nacional. A falta de entrega pode gerar <b>multas</b>.</li>
</ul>
`;
const TXT_DESENQ_SN_INAPTO = `
Seu CNPJ está <b>inapto</b> e também foi desenquadrado do MEI (SIMEI), passando para o <b>Simples Nacional</b>. Isso traz algumas implicações:
<ul style="margin:8px 0 0 18px">
<li>No Simples Nacional, os impostos são calculados sobre o faturamento (mínimo de <b>6%</b> para serviços).</li>
<li>A inaptidão ocorreu pela falta de entrega de declarações. Para regularizar e permitir a baixa do CNPJ, será necessário entregar as declarações do Simples Nacional do período em que esteve desenquadrado, mesmo sem movimento.</li>
<li>A não entrega de declarações no Simples Nacional também pode gerar <b>multas</b>. É crucial regularizar essa situação.</li>
</ul>
`;
const TXT_DESENQ_LP_ATIVO = `
<b>Alerta importante!</b> Devido às pendências, seu CNPJ foi desenquadrado do MEI (SIMEI) e também do Simples Nacional. Atualmente, sua empresa está no regime de <b>Lucro Presumido</b>.<br><br>
Este regime é mais complexo, exige um contador mensal e possui impostos mais altos (<b>mínimo de 13,33%</b> para serviços sobre o faturamento), além de <b>multas</b> por declarações não entregues.
`;
const TXT_DESENQ_LP_INAPTO = `
<b>Alerta importante!</b> Seu CNPJ está <b>inapto</b> e foi desenquadrado do MEI (SIMEI) e do Simples Nacional, estando agora no regime de <b>Lucro Presumido</b>.<br><br>
Para regularizar e conseguir baixar este CNPJ, será necessário entregar declarações complexas do Lucro Presumido, mesmo sem movimento. Este regime tem impostos mais altos (<b>mínimo 13,33%</b> para serviços) e a falta de declarações pode gerar <b>multas</b>.
`;

// =========================
// FLUXO DE MENSAGENS
// =========================
async function iniciarConversa(data) {
  if (safeText(data.responsavel)) await botSayHTML(`Olá, <b>${safeText(data.responsavel)}</b>.`); else await botSay("Olá.");

  await botSayHTML(textoSituacao(window.diag.tela1?.status));

  await botSayHTML(TEXTO_DIVIDA_ATIVA);

  // Enquadramento
  const st = (window.diag.tela1?.status || "").toLowerCase();
  if (window.diag.tela5?.simei_optante === true) {
    await botSayHTML(TXT_ENQ_MEI);
  } else if (window.diag.tela5?.simei_optante === false) {
    if (st.includes("inapto")) await botSayHTML(TXT_DESENQ_SN_INAPTO);
    else await botSayHTML(TXT_DESENQ_SN_ATIVO);
  }

  // DASN
  await perguntarDASN();
}

async function perguntarDASN() {
  await botSayHTML(`Sobre a <b>Declaração Anual de Faturamento (DASN-SIMEI)</b> do ano passado, você já entregou?`);
  mostrarOpcoes(
    [
      { label: "Ainda não", value: "ainda_nao", classe: "verde" },
      { label: "Já declarei", value: "ja_declarei" },
      { label: "Não sei", value: "nao_sei" }
    ],
    async (val, label) => {
      addMensagem(label, "user");
      window.userAnswers.dasnResposta = val;

      const st = (window.diag.tela1?.status || "").toLowerCase();
      if (val === "ainda_nao") {
        window.diag.tela3 = { dasn_pendente: true };
        if (st.includes("baixado")) {
          await botSayHTML(`Adicionalmente, a <b>declaração anual especial</b> de faturamento, necessária devido ao encerramento do CNPJ, <b>não foi apresentada</b>. O prazo já se esgotou; há possibilidade de <b>multa de R$ 50</b>.`);
        } else {
          await botSayHTML(`Também identifiquei que a <b>Declaração Anual de Faturamento</b> do seu CNPJ está <b>pendente</b>. A não entrega pode resultar em uma <b>multa de aproximadamente R$ 25,00</b>.`);
        }
      } else if (val === "ja_declarei") {
        window.diag.tela3 = { dasn_pendente: false };
        await botSayHTML(`Ok! Vamos considerar como <b>entregue</b> e <b>um especialista</b> confirmará durante o processo.`);
      } else {
        window.diag.tela3 = { dasn_pendente: null };
        await botSayHTML(`Sem problema. Vamos prosseguir; essa informação será conferida por um especialista e registrada no PDF.`);
      }

      // Proposta completa
      const proposta = montarPropostaCompleta(window.diag);
      await botSayHTML(proposta.previewMsg);

      // Aviso de pagamento hoje
      await botSayHTML(`Para prosseguir, você deverá <b>efetuar o pagamento</b> assim que o processo for <b>concluído</b> e a situação estiver <b>100% regularizada</b> — todo esse processo é <b>concluído hoje mesmo</b>. Se estiver ciente e quiser continuar, clique em <b>"Quero prosseguir"</b>.`);

      mostrarOpcoes(
        [
          { label: "Quero prosseguir", value: "ok", classe: "verde" },
          { label: "Consultar outro CNPJ", value: "novo" }
        ],
        async (v, l) => {
          addMensagem(l, "user");
          if (v === "ok") {
            await botSayHTML(proposta.docMensagemHTML);

            await botSayHTML(`Você possui o investimento <b>hoje</b> para pagamento após a conclusão?`);
            mostrarOpcoes(
              [
                { label: "Sim", value: "sim", classe: "verde" },
                { label: "Ainda não", value: "nao" }
              ],
              async (v2, l2) => {
                addMensagem(l2, "user");
                if (v2 === "sim") {
                  mostrarOpcoes(
                    [{ label: "Continuar a regularização", value: "zap", classe: "verde" }],
                    () => {
                      enviarWhatsAppComContexto(proposta);
                      // Após abrir o WhatsApp, oferece fechar o fluxo
                      mostrarOpcoes(
                        [
                          { label: "Baixar Diagnóstico (PDF)", value: "pdf", classe: "verde" },
                          { label: "Consultar novo CNPJ", value: "novo" }
                        ],
                        (x) => { if (x === "pdf") baixarConversa(); if (x === "novo") location.reload(); }
                      );
                    }
                  );
                } else {
                  mostrarOpcoes(
                    [
                      { label: "Baixar Diagnóstico (PDF)", value: "pdf", classe: "verde" },
                      { label: "Consultar novo CNPJ", value: "novo" }
                    ],
                    (x) => { if (x === "pdf") baixarConversa(); if (x === "novo") location.reload(); }
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
  opcoes.forEach(o => {
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
// PROPOSTAS (texto integral + valores atualizados)
// =========================
function montarPropostaCompleta(diag) {
  const VAL = 399;
  const status = (diag.tela1?.status || "").toLowerCase();
  const ativo   = status.includes("ativo");
  const inapto  = status.includes("inapto");
  const baixado = status.includes("baixado");
  const simei   = !!diag.tela5?.simei_optante;

  // 1) MEI ativo/inapto (continua MEI)
  if ((ativo || inapto) && simei) {
    const texto =
      `<b>Proposta — Regularizar MEI</b><br><br>
      Boa notícia! Seu CNPJ ainda está enquadrado como <b>MEI</b>. Para regularizar sua situação, nosso serviço inclui:
      <ul style="margin:8px 0 0 18px">
        <li>Parcelamento da Dívida Ativa no seu CPF, buscando a redução e parcelamento prolongado.</li>
        <li>Parcelamento das guias mensais (DAS) em aberto no CNPJ.</li>
        <li>Entrega das declarações anuais de faturamento (DASN-SIMEI) pendentes.</li>
      </ul>
      <br><b>Investimento:</b> <b>R$ ${VAL}</b>. Você pode pagar à vista (PIX ou débito) ou parcelar no cartão de crédito em até 10x. O pagamento será solicitado pelo nosso time de especialistas para iniciar o serviço.<br><br>
      <i>Importante:</i> Regularizar agora evita que suas dívidas aumentem, sejam enviadas a cartório ou causem problemas judiciais.`;
    const docs =
      `<b>Documentação necessária</b><br>
      Ótimo! Para darmos o primeiro passo, precisaremos:
      <ul style="margin:8px 0 0 18px">
        <li>Nome completo da mãe</li>
        <li>Nome completo do pai</li>
        <li>Data de nascimento</li>
        <li>Número do CPF</li>
      </ul>
      Pode nos enviar os dados digitados ou uma foto do seu RG/CNH (frente e verso, se necessário).<br><br>
      Após recebermos seus dados, nossa equipe analisará e enviará as instruções para o pagamento do investimento inicial de <b>R$ ${VAL}</b> (a ser realizado após negociação da dívida).`;
    return { previewMsg: texto, docMensagemHTML: docs, tipo: "MEI" };
  }

  // 2) CNPJ já baixado
  if (baixado) {
    const texto =
      `<b>Proposta — CNPJ já baixado</b><br><br>
      Verificamos que seu CNPJ já está <b>baixado</b>. As guias mensais (DAS) que não foram pagas antes da baixa geraram uma <b>dívida vinculada ao seu CPF</b>.<br><br>
      Para evitar protesto em cartório, crescimento com juros e problemas futuros, podemos ajudar a conseguir uma boa <b>redução</b> e <b>parcelamento prolongado</b>.<br><br>
      <b>Investimento:</b> <b>R$ ${VAL}</b>. Pagamento à vista ou em até 10x; será solicitado pelo nosso time para dar início.<br><br>
      Você gostaria de dar início ao processo?`;
    const docs =
      `<b>Documentação necessária</b><br>
      Ótimo! Para iniciar a negociação/parcelamento no CPF, precisamos:
      <ul style="margin:8px 0 0 18px">
        <li>Nome completo da mãe</li>
        <li>Nome completo do pai</li>
        <li>Data de nascimento</li>
        <li>CPF</li>
      </ul>
      Envie digitado ou foto do RG/CNH. Após análise, enviaremos as instruções de pagamento de <b>R$ ${VAL}</b>.`;
    return { previewMsg: texto, docMensagemHTML: docs, tipo: "BAIXADO" };
  }

  // 3) Ativo desenquadrado (regularizar 1ª fase)
  if (ativo && !simei) {
    const texto =
      `<b>Proposta — Regularizar (ativo desenquadrado)</b><br><br>
      Identificamos que seu CNPJ está ativo, mas foi desenquadrado do MEI. O primeiro passo é regularizar todas as pendências do período em que ainda era MEI. Nosso serviço inclui:
      <ul style="margin:8px 0 0 18px">
        <li>Análise completa da situação fiscal do CNPJ.</li>
        <li>Regularização de dívidas do período MEI (Dívida Ativa no CPF, guias DAS em aberto), buscando redução e parcelamento prolongado.</li>
        <li>Entrega de declarações anuais de faturamento (DASN-SIMEI) pendentes desse período.</li>
        <li>Orientação inicial sobre suas novas obrigações no regime atual (Simples Nacional ou Lucro Presumido).</li>
      </ul>
      <br><b>Investimento:</b> <b>R$ ${VAL}</b>. O pagamento será solicitado após a realização do processo.<br><br>
      Vamos dar o primeiro passo para regularizar seu CNPJ?`;
    const docs =
      `<b>Documentação necessária</b><br>
      Ótimo! Para iniciar a 1ª fase, precisamos:
      <ul style="margin:8px 0 0 18px">
        <li>Nome completo da mãe</li>
        <li>Nome completo do pai</li>
        <li>Data de nascimento</li>
        <li>CPF</li>
      </ul>
      Após análise, enviaremos as instruções para pagamento de <b>R$ ${VAL}</b>.`;
    return { previewMsg: texto, docMensagemHTML: docs, tipo: "ATIVO_DESENQ" };
  }

  // 4) Regularizar e BAIXAR (ativo/inapto desenquadrado)
  if (!simei && (ativo || inapto)) {
    const texto =
      `<b>Proposta — Baixar CNPJ (desenquadrado)</b><br><br>
      Seu CNPJ está ${ativo ? "<b>ativo</b>" : "<b>inapto</b>"} e foi desenquadrado do MEI. Se o objetivo é encerrar, o processo tem duas etapas:
      <ol style="margin:8px 0 0 18px">
        <li><b>R$ ${VAL}</b>: Regularização das pendências do período MEI (negociação da Dívida Ativa, guias em aberto e declarações anuais pendentes).</li>
        <li><b>R$ ${VAL}</b>: Baixa no regime atual (Simples Nacional ou Lucro Presumido) junto à Receita e Junta.</li>
      </ol>
      <br><b>Investimento total:</b> <b>R$ 798</b> (2× de R$ ${VAL}). A primeira parte é cobrada após a negociação da dívida; a segunda ao concluir a baixa (média 15 dias úteis). Se preferir, pode parcelar o total no cartão.<br><br>
      Importante: este processo garante o encerramento correto. Após a baixa, se desejar, a abertura de um novo CNPJ MEI é gratuita.`;
    const docs =
      `<b>Documentação necessária</b><br>
      Excelente decisão! Para iniciarmos o processo completo, precisaremos:
      <ul style="margin:8px 0 0 18px">
        <li>Número do CPF</li>
        <li>Data de nascimento</li>
        <li>Nome completo da mãe</li>
        <li>Nome completo do pai</li>
      </ul>
      Você pode enviar foto do RG/CNH. Após o envio, confirmaremos os detalhes e as instruções para pagamento da <b>1ª parcela (R$ ${VAL})</b>. A <b>2ª parcela (R$ ${VAL})</b> é paga na conclusão.`;
    return { previewMsg: texto, docMensagemHTML: docs, tipo: "BAIXA_ATIVO_DESENQ" };
  }

  // 5) Inapto + SN (baixa completa com declarações do SN)
  if (inapto && !simei) {
    const total = 399 + 499 + 399; // 1297
    const segunda = 499 + 399; // 898
    const texto =
      `<b>Proposta — Baixa (inapto no Simples Nacional)</b><br><br>
      Para cancelar corretamente:
      <ol style="margin:8px 0 0 18px">
        <li><b>R$ 399</b>: Regularização das dívidas do período MEI (negociação da Dívida Ativa no CPF e demais guias em aberto).</li>
        <li><b>R$ 499</b>: Entrega das declarações do período no <b>Simples Nacional</b> (PGDAS, DEFIS, DCTFWeb etc.), mesmo sem movimento.</li>
        <li><b>R$ 399</b>: Cancelamento (baixa) do CNPJ na Receita Federal e Junta Comercial.</li>
      </ol>
      <br><b>Investimento total:</b> <b>R$ ${total.toLocaleString("pt-BR")}</b>.<br>
      <b>Pagamento:</b> a primeira etapa (R$ 399) após a negociação da dívida. A segunda cobrança (R$ ${segunda}) é paga na conclusão (média 15 dias úteis). Ou parcele o total em até 10x.<br><br>
      Importante: evita aumento das dívidas e garante o encerramento correto.`;
    const docs =
      `<b>Documentação necessária</b><br>
      Excelente decisão! Para iniciarmos o processo completo, precisamos:
      <ul style="margin:8px 0 0 18px">
        <li>CPF</li>
        <li>Data de nascimento</li>
        <li>Nome completo da mãe</li>
        <li>Nome completo do pai</li>
      </ul>
      Após o envio, nosso time confirmará os detalhes e instruirá o pagamento da <b>1ª etapa (R$ 399)</b>.`;
    return { previewMsg: texto, docMensagemHTML: docs, tipo: "BAIXA_INAPTO_SN" };
  }

  // 6) Inapto + LP
  if (inapto && !simei) {
    // este ramo já coberto acima; deixo fallback abaixo caso precise diferenciar LP detectado externamente
  }

  // Fallback (se LP for detectado de outra fonte)
  const totalLP = 399 + 799 + 399; // 1597
  const segundaLP = 799 + 399; // 1198
  const textoLP =
    `<b>Proposta — Baixa (inapto no Lucro Presumido)</b><br><br>
    Processo mais complexo:
    <ol style="margin:8px 0 0 18px">
      <li><b>R$ 399</b>: Regularização das dívidas do período MEI (negociação no CPF e demais guias).</li>
      <li><b>R$ 799</b>: Entrega das declarações do <b>Lucro Presumido</b> (DCTF, DCTFWeb, ECF etc.), mesmo sem movimento.</li>
      <li><b>R$ 399</b>: Baixa do CNPJ na Receita e Junta.</li>
    </ol>
    <br><b>Investimento total:</b> <b>R$ ${totalLP.toLocaleString("pt-BR")}</b>.<br>
    <b>Pagamento:</b> 1ª etapa (R$ 399) após a negociação da Dívida Ativa. A segunda cobrança (R$ ${segundaLP}) na conclusão (≈15 dias úteis). Ou parcelamento em até 10x.`;
  const docsLP =
    `<b>Documentação necessária</b><br>
    Para iniciar o processo completo, precisamos:
    <ul style="margin:8px 0 0 18px">
      <li>CPF</li>
      <li>Data de nascimento</li>
      <li>Nome completo da mãe</li>
      <li>Nome completo do pai</li>
    </ul>
    Envie os dados ou foto do RG/CNH. Após recebermos, enviaremos a cobrança da <b>1ª etapa (R$ 399)</b>.`;
  return { previewMsg: textoLP, docMensagemHTML: docsLP, tipo: "BAIXA_INAPTO_LP" };
}

// =========================
// WHATSAPP
// =========================
function enviarWhatsApp() { enviarWhatsAppComContexto(montarPropostaCompleta(window.diag)); }
function enviarWhatsAppComContexto(prop) {
  const d = window.dadosCNPJ || {};
  const texto =
`Realizei o diagnóstico e quero regularizar.
CNPJ: ${d.cnpj || ultimoCNPJ || ""}
Status: ${window.diag.tela1?.status || ""}
Resumo: ${prop.previewMsg.replace(/<[^>]+>/g, "")}`;
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
  } catch { doc.setFont("helvetica", "normal"); }

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

  doc.setFontSize(16); doc.text("Relatório Oficial - CNPJ Legal", 60, 18);
  doc.setFontSize(10); doc.text("Gerado em: " + sanitize(dataHora), 60, 24);
  doc.line(14, 28, 196, 28);

  const linhas = [
    ["CNPJ", d.cnpj || ultimoCNPJ || "-"],
    ["Razão Social", d.razao_social || (d.company && d.company.name) || "-"],
    ["Situação Cadastral", window.diag.tela1?.status || "-"],
    ["Enquadramento", window.diag.tela5?.simei_optante === true ? "MEI (SIMEI)" :
                      (window.diag.tela5?.simei_optante === false ? "Desenquadrado do MEI" : "-")]
  ].map(([k,v]) => [sanitize(k), sanitize(String(v))]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: 34,
      head: [["Campo", "Informação"]],
      body: linhas,
      theme: "striped",
      headStyles: { fillColor: [15, 62, 250], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } }
    });
  }

  const dsum = [
    ["T1 — Situação Cadastral (RFB)", window.diag.tela1?.status || "-"],
    ["T2 — Dívida Ativa (PGFN/CPF)", USE_PGFN ? (window.diag.tela2?.status || "-") : "Consulta não realizada nesta etapa"],
    ["T3 — Declaração Anual (DASN-SIMEI)", window.userAnswers.dasnResposta === "ainda_nao" ? "Pendente" : (window.userAnswers.dasnResposta === "ja_declarei" ? "Em dia" : "Informado: não sabe")],
    ["T4 — Débitos DAS (PGMEI)", "Não avaliado automaticamente"],
    ["T5 — Enquadramento (SIMEI/SN/LP)", window.diag.tela5?.simei_optante === true ? "MEI (SIMEI)" :
                                         (window.diag.tela5?.simei_optante === false ? "Desenquadrado do MEI" : "-")]
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
  doc.setFontSize(14); doc.text("Proposta", 14, y); y += 6;
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(sanitize(prop.previewMsg.replace(/<[^>]+>/g, "")), 182), 14, y);

  y += 16;
  doc.setFontSize(11);
  doc.text("Entre em contato pelo WhatsApp para avançarmos com a regularização.", 14, y);
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

// =========================
// EXPOSE
// =========================
window.consultarCNPJ = consultarCNPJ;
window.enviarWhatsApp = enviarWhatsApp;
window.baixarConversa = baixarConversa;
document.addEventListener("DOMContentLoaded", prepararHeroChips);
