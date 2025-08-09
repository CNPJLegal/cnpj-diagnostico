// =========================
// CONFIG
// =========================
const USE_PGFN = false; // deixe false enquanto não contratar a API da PGFN

// =========================
//// AVATARES
// =========================
const avatarBot  = "https://i.ibb.co/b5h1V8nd/i-cone.png";            // CNPJ Legal
const avatarUser = "https://i.ibb.co/8D2DQtrZ/icon-7797704-640.png";  // Usuário

// Estado global simples
let ultimoCNPJ = "";
window.dadosCNPJ = {};

// Estrutura consolidada das 5 telas do diagnóstico
window.diag = {
  tela1: null,                                   // Situação Cadastral (RFB/CNPJ)
  tela2: { status: USE_PGFN ? "PENDENTE" : "NAO_CONSULTADO", detalhes: null }, // PGFN/CPF (padrão texto)
  tela3: null,                                   // DASN-SIMEI (declaração anual)
  tela4: { ignorada: true },                     // PGMEI (débitos DAS) — ignorada no chat
  tela5: null                                    // SIMEI/Simples/Lucro Presumido
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

// Adiciona bolha (texto puro)
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

// Adiciona bolha permitindo HTML controlado
function addMensagemHTML(html, autor = 'bot') {
  const chat = document.getElementById('resultado');
  const div = document.createElement('div');
  div.className = autor === 'bot' ? 'msg-bot' : 'msg-user';
  const avatar = autor === 'bot' ? avatarBot : avatarUser;

  div.innerHTML = `
    <img src="${avatar}" class="avatar" alt="${autor}">
    <span>${html}</span>
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
// bot "digita" e envia texto puro
async function botSay(texto, delay = 500) {
  const t = startTyping();
  await sleep(delay);
  stopTyping(t);
  addMensagem(texto, 'bot');
}
// bot "digita" e envia HTML
async function botSayHTML(html, delay = 500) {
  const t = startTyping();
  await sleep(delay);
  stopTyping(t);
  addMensagemHTML(html, 'bot');
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

    // NORMALIZAÇÕES/DEFAULTS
    const status = safeText(data.status || data.situacao || "");
    const simplesOptante = !!(data.simples_optante ?? data.simei?.optante ?? data.company?.simei?.optant);
    const dasnPendente   = null; // vamos perguntar ao usuário
    const dasAbertas     = null; // Etapa 4 ignorada

    // Tentar identificar regime fora do SIMEI (se vier do backend)
    const regimeRaw = (data.regime || data.simples_regime || data.company?.regime || "").toLowerCase();
    let regimeAtual = "";
    if (regimeRaw.includes("lucro presumido")) regimeAtual = "LP";
    else if (!simplesOptante && regimeRaw.includes("simples")) regimeAtual = "SN";

    // Grava no diag
    window.diag.tela1 = { status: status || "—" };
    window.diag.tela3 = { dasn_pendente: dasnPendente, resposta_usuario: null };
    window.diag.tela4 = { ignorada: true };
    window.diag.tela5 = { simei_optante: simplesOptante, regime: regimeAtual };

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
function textoTela1(status) {
  const s = (status || "").toLowerCase();
  if (s.includes('ativo')) {
    return "<strong>/TEXTO1 CNPJ ATIVO</strong><br>Confirmamos que seu CNPJ está <strong>ativo</strong> na Receita Federal. No entanto, identificamos a existência de guias de pagamento mensais <strong>pendentes</strong>.";
  }
  if (s.includes('baixado')) {
    return "<strong>/TEXTO1 CNPJ BAIXADO</strong><br>Seu CNPJ está <strong>baixado (encerrado)</strong> na Receita Federal. Mesmo com o CNPJ baixado, ainda existem <strong>valores em aberto</strong> que precisam ser regularizados.";
  }
  if (s.includes('inapto')) {
    return "<strong>/TEXTO1 CNPJ INAPTO</strong><br>Seu CNPJ está <strong>inapto</strong> perante a Receita Federal devido a <strong>pendências existentes</strong>.";
  }
  return "Situação cadastral: não identificada.";
}

function textoTela2Padrao() {
  return `
  <strong>/TEXTO2 DIVIDA ATIVA</strong><br>
  Devido ao não pagamento das taxas mensais do seu CNPJ, a dívida foi <strong>transferida para o seu CPF</strong>, tornando-se uma <strong>dívida ativa com a Receita Federal</strong>.<br><br>
  A dívida ativa pode acarretar sérias consequências como:
  <ul style="margin:6px 0 0 18px;">
    <li>Bloqueio de contas bancárias</li>
    <li>Bloqueio de maquininhas de cartão</li>
    <li>Impedimento de emissão de notas fiscais</li>
    <li>Penhora de bens</li>
    <li>Inclusão em cadastros de inadimplentes (SPC/SERASA)</li>
    <li>Envio da dívida para cartório, gerando custos adicionais</li>
  </ul>
  <br>
  <strong>Temos uma solução:</strong> É possível <strong>conseguir até 50% de desconto</strong> e <strong>parcelar o saldo restante em até 60 vezes</strong>, facilitando a regularização e evitando que essas consequências ocorram.
  `;
}

function textoTela3Pendente(status) {
  const s = (status || "").toLowerCase();
  if (s.includes('baixado')) {
    return "<strong>/TEXTO3DECLARACAOESPECIAL</strong><br>Adicionalmente, a <strong>declaração anual especial</strong> de faturamento, necessária devido ao encerramento do CNPJ, <strong>não foi apresentada</strong>. O prazo para essa entrega já se esgotou; existe a possibilidade de multa de <strong>R$ 50,00</strong>.";
  }
  return "<strong>/TEXTO3 DECLARACAO ANUAL</strong><br>Também identifiquei que a <strong>Declaração Anual de Faturamento</strong> do seu CNPJ está <strong>pendente</strong>. A não entrega pode resultar em uma <strong>multa de ~R$ 25,00</strong>.";
}

function textoTela5(diag) {
  const status = (diag.tela1?.status || "").toLowerCase();
  const ativo   = status.includes("ativo");
  const inapto  = status.includes("inapto");
  const simei   = !!diag.tela5?.simei_optante;
  const regime  = diag.tela5?.regime || ""; // "SN" | "LP" | ""

  if (simei && (ativo || inapto)) {
    return "<strong>/TEXTO5 ENQUADRADO MEI</strong><br>A notícia positiva é que seu CNPJ <strong>não foi desenquadrado do MEI</strong>. Portanto, precisamos apenas regularizar as pendências para que o CNPJ retorne à situação regular.<br><br>É importante lembrar que, se as pendências não forem resolvidas, o CNPJ pode ser desenquadrado do MEI e migrar para regimes com impostos mais altos e mais burocracia.";
  }

  if (!simei && regime === "SN" && ativo) {
    return "<strong>/TEXTO5 DESENQ SIMPLES ATIVO</strong><br>Identificamos que seu CNPJ foi <strong>desenquadrado do MEI (SIMEI)</strong> e agora está no <strong>Simples Nacional</strong>. Implicações:<ul style='margin:6px 0 0 18px;'><li>Impostos calculados sobre o faturamento (mínimo <strong>6%</strong> para serviços).</li><li>Declarações mensais e anuais do Simples são obrigatórias; a falta gera <strong>multas</strong>.</li></ul>";
  }

  if (!simei && regime === "SN" && inapto) {
    return "<strong>/TEXTO5 DESENQ SIMPLES INAPTO</strong><br>Seu CNPJ está <strong>inapto</strong> e foi <strong>desenquadrado do MEI</strong>, passando para o <strong>Simples Nacional</strong>. Implicações:<ul style='margin:6px 0 0 18px;'><li>Impostos calculados sobre o faturamento (mínimo <strong>6%</strong> para serviços).</li><li>Para regularizar e permitir a baixa, será necessário entregar as declarações do Simples do período em que esteve desenquadrado (mesmo sem movimento).</li><li>A não entrega gera <strong>multas</strong>.</li></ul><strong>É crucial regularizar essa situação.</strong>";
  }

  if (!simei && regime === "LP" && ativo) {
    return "<strong>/TEXTO5 DESENQ LP ATIVO</strong><br><strong>Alerta importante!</strong> Seu CNPJ foi desenquadrado do MEI e do Simples Nacional, estando no regime de <strong>Lucro Presumido</strong>.<br><br>Este regime é mais complexo, exige contador mensal e possui impostos mais altos (mínimo <strong>13,33%</strong> para serviços), além de multas por declarações não entregues.";
  }

  if (!simei && regime === "LP" && inapto) {
    return "<strong>/TEXTO5 DESENQ LP INAPTO</strong><br><strong>Alerta importante!</strong> Seu CNPJ está <strong>inapto</strong> e foi desenquadrado do MEI e do Simples, estando agora no <strong>Lucro Presumido</strong>.<br><br>Para regularizar e conseguir a baixa, será necessário entregar declarações do Lucro Presumido (mesmo sem movimento). Este regime tem impostos mais altos (mínimo <strong>13,33%</strong> para serviços) e a falta de declarações pode gerar multas.";
  }

  // fallback quando só sabemos que não é MEI, mas não sabemos SN vs LP
  if (!simei) {
    const rotulo = ativo ? "DESENQ SIMPLES ATIVO" : (inapto ? "DESENQ SIMPLES INAPTO" : "DESENQ");
    return `<strong>/TEXTO5 ${rotulo}</strong><br>Identificamos que seu CNPJ foi <strong>desenquadrado do MEI</strong>. No regime atual, há <strong>obrigações acessórias</strong> e tributos sobre o faturamento. Nosso time cuidará das declarações necessárias e das pendências para regularizar sua situação.`;
  }

  return "Situação de enquadramento não identificada.";
}

// Mostra botões de opção e retorna uma Promise com a escolha
function perguntarComBotoes(opcoes = []) {
  return new Promise(resolve => {
    const chat = document.getElementById('resultado');
    const div  = document.createElement('div');
    div.className = 'opcoes-botoes';

    opcoes.forEach(op => {
      const btn = document.createElement('button');
      btn.textContent = op.label;
      if (op.verde) btn.classList.add('verde');
      btn.onclick = () => {
        // Mostra a escolha do usuário no chat
        addMensagem(op.label, 'user');
        div.remove();
        resolve(op.value);
      };
      div.appendChild(btn);
    });

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  });
}

async function iniciarConversa(data) {
  // Saudação com nome
  const nome = safeText(
    data.nome_empresario || data.nome_titular || data.responsavel ||
    data.razao_social || data.company?.owner || data.company?.name || ""
  );
  if (nome) await botSayHTML(`Olá, <strong>${nome}</strong>.`);
  else      await botSay("Olá.");

  // ETAPA 1 — Situação Cadastral
  if (window.diag.tela1?.status) {
    await botSayHTML(textoTela1(window.diag.tela1.status));
  }

  // ETAPA 2 — Dívida Ativa (mensagem padrão)
  await botSayHTML(textoTela2Padrao());

  // ETAPA 3 — Perguntar sobre DASN do ano passado
  await botSayHTML(`Sobre a <strong>Declaração Anual de Faturamento (DASN-SIMEI)</strong> do ano passado, você já entregou?`);
  const resp = await perguntarComBotoes([
    { label: "Ainda não",  value: "nao" },
    { label: "Já declarei", value: "sim" },
    { label: "Não sei",    value: "ns" }
  ]);

  // Registrar resposta e mensagens
  window.diag.tela3.resposta_usuario = resp;

  if (resp === "nao") {
    window.diag.tela3.dasn_pendente = true;
    await botSayHTML(textoTela3Pendente(window.diag.tela1?.status));
  } else if (resp === "sim") {
    window.diag.tela3.dasn_pendente = false;
    await botSayHTML("Perfeito! Vamos considerar como <strong>em dia</strong>. De qualquer forma, um especialista do CNPJ Legal irá <strong>verificar nos sistemas oficiais</strong> durante o processo de regularização.");
  } else {
    window.diag.tela3.dasn_pendente = null; // desconhecido
    await botSay("Sem problemas! Vamos seguir e nossa equipe validará isso ao dar andamento.");
  }

  // ETAPA 4 — Ignorada (apenas anotada)
  // (nada no chat)

  // ETAPA 5 — Enquadramento
  await botSayHTML(textoTela5(window.diag));

  // PROPOSTA + confirmação de pagamento
  const proposta = gerarPropostaComBaseNoDiagnostico(window.diag);
  await botSayHTML(`<strong>Proposta sugerida:</strong> ${proposta.titulo} — <strong>${proposta.valor}</strong>`);

  await botSayHTML(
    `Para prosseguir, você deverá <strong>efetuar o pagamento</strong> assim que o processo for <strong>concluído</strong> e a situação estiver <strong>100% regularizada</strong>. Todo esse processo é <strong>concluído hoje mesmo</strong>. Se estiver ciente e quiser continuar, clique em <strong>"Quero prosseguir"</strong>.`
  );

  // Botões finais
  await mostrarBotoesFinais();
}

async function mostrarBotoesFinais() {
  const escolha = await perguntarComBotoes([
    { label: "Quero prosseguir", value: "ok", verde: true },
    { label: "Consultar outro CNPJ", value: "novo" }
  ]);

  if (escolha === "novo") {
    location.reload();
    return;
  }

  // Escolheu prosseguir → documentos (de acordo com a proposta)
  const prop = gerarPropostaComBaseNoDiagnostico(window.diag);
  if (["MEI","BAIXADO","ATIVO_DESENQ","PADRAO"].includes(prop.tipo)) {
    // /DOCUMENTO REGULARIZACAO SIMPLES
    await botSayHTML(
      `<strong>/DOCUMENTO REGULARIZACAO SIMPLES</strong><br>
      Ótimo! Para darmos o primeiro passo, precisaremos de algumas informações para acessar os sistemas da Receita Federal:
      <ul style="margin:6px 0 0 18px;">
        <li>Nome completo da mãe;</li>
        <li>Nome completo do pai;</li>
        <li>Data de nascimento;</li>
        <li>Número do CPF.</li>
      </ul>
      Você pode nos enviar os dados digitados ou uma foto do RG/CNH (frente e verso, se necessário).<br><br>
      Após recebermos seus dados, nossa equipe analisará e enviará as instruções para o pagamento do investimento inicial de <strong>R$ 399</strong> (realizado após a negociação da dívida).`
    );
  } else {
    // Processos completos (baixa etc.)
    await botSayHTML(
      `<strong>/DOCUMENTOS PROCESSOS COMPLETOS</strong><br>
      Excelente decisão! Para iniciarmos o processo completo, precisaremos:
      <ul style="margin:6px 0 0 18px;">
        <li>Número do CPF;</li>
        <li>Data de nascimento;</li>
        <li>Nome completo da mãe;</li>
        <li>Nome completo do pai.</li>
      </ul>
      Uma foto do RG/CNH (frente e verso) geralmente contém tudo que precisamos.<br><br>
      Após o envio dos dados, nossa equipe confirmará os detalhes e enviará as instruções para o pagamento da primeira parte do investimento, no valor de <strong>R$ 399</strong> (após a negociação da Dívida Ativa). A segunda parcela será solicitada na conclusão do processo (prazo médio de 15 dias úteis).`
    );
  }

  // Botão para abrir o WhatsApp (só após confirmar)
  const chat = document.getElementById('resultado');
  const div  = document.createElement('div');
  div.className = 'opcoes-botoes';
  const btn = document.createElement('button');
  btn.textContent = "Ir para o WhatsApp";
  btn.classList.add('verde');
  btn.onclick = enviarWhatsApp;
  div.appendChild(btn);
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
  const regime    = diag.tela5?.regime || ""; // "SN" | "LP" | ""
  // const dasnPend  = diag.tela3?.dasn_pendente; // se precisar

  // 1) MEI ativo/inapto (continua MEI)
  if ((ativo || inapto) && simei) {
    return {
      keyword: "/PROPOSTA REGULARIZAR MEI",
      titulo:  "Regularização MEI",
      valor:   `R$ ${VAL_UNIT}`,
      corpo: [
        "Parcelamento da Dívida Ativa (CPF), buscando redução e parcelamento prolongado.",
        "Parcelamento de DAS em aberto.",
        "Entrega das DASN-SIMEI pendentes."
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
        "Prevenção de protesto e outros agravamentos."
      ],
      tipo: "BAIXADO"
    };
  }

  // 3) Ativo desenquadrado do MEI (1ª fase de regularização MEI)
  if (ativo && !simei) {
    return {
      keyword: "/PROPOSTA REGUL ATIVO DESENQ",
      titulo:  "1ª fase — Regularização do período MEI",
      valor:   `R$ ${VAL_UNIT}`,
      corpo: [
        "Análise fiscal completa.",
        "Regularização de DAS (período MEI).",
        "Entrega de DASN-SIMEI em atraso.",
        "Orientações sobre o regime atual (SN/LP)."
      ],
      tipo: "ATIVO_DESENQ"
    };
  }

  // 4) Regularizar e baixar CNPJ desenquadrado (duas parcelas)
  if (!simei && (ativo || inapto)) {
    return {
      keyword: ativo ? "/PROPOSTA BAIXA ATIVO DESENQ" : (inapto && regime !== "LP" ? "/PROPOSTA BAIXA INAPTO SN" : "/PROPOSTA BAIXA ATIVO DESENQ"),
      titulo:  "Regularizar e Baixar o CNPJ",
      valor:   PARC_DUPLA,
      corpo: [
        "Etapa 1 (R$ 399): Regularização MEI (DAS + DASN).",
        "Etapa 2 (R$ 399): Baixa no regime atual (SN/LP) na Receita e Junta.",
        "Prazo médio: ~15 dias úteis na 2ª etapa."
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

  // helper: remove emojis
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

  // Nome do empreendedor
  const nomeEmp = sanitize(
    d.nome_empresario || d.nome_titular || d.responsavel ||
    d.company?.owner || d.company?.name || d.razao_social || "—"
  );

  // 3) Tabela cadastral mínima
  const linhasCadastrais = [
    ["Empreendedor", nomeEmp],
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

  // 4) Resumo das 5 telas
  const dasnTxt = window.diag.tela3?.dasn_pendente === true ? "Pendente"
                : window.diag.tela3?.dasn_pendente === false ? "Em dia"
                : (window.diag.tela3?.resposta_usuario === "ns" ? "Não informado (usuário)" : "—");

  const dsum = [
    ["T1 — Situação Cadastral (RFB)", window.diag.tela1?.status || "—"],
    ["T2 — Dívida Ativa (PGFN/CPF)", USE_PGFN ? (window.diag.tela2?.status || "—") : "Consulta não realizada nesta etapa"],
    ["T3 — Declaração Anual (DASN-SIMEI)", dasnTxt],
    ["T4 — Débitos DAS (PGMEI)", "Etapa ignorada no chat"],
    ["T5 — Enquadramento (SIMEI/SN/LP)", window.diag.tela5?.simei_optante === true ? "MEI (SIMEI)" : (window.diag.tela5?.simei_optante === false ? (window.diag.tela5?.regime === "LP" ? "Lucro Presumido" : "Simples Nacional") : "—")]
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

  // 6) Chamada + botão WhatsApp (arredondado, texto em negrito)
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
  try { doc.setFont(undefined, "bold"); } catch {}
  doc.setFontSize(11);
  doc.text(sanitize("Falar no WhatsApp"), btnX + 8, btnY + 8);

  const linkWhats = `https://wa.me/554396015785?text=${encodeURIComponent(
    "Quero regularizar meu CNPJ"
  )}`;
  doc.link(btnX, btnY, btnW, btnH, { url: linkWhats });

  // 7) Rodapé
  let fy = btnY + 22;
  try { doc.setFont(undefined, "normal"); } catch {}
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(sanitize("Instagram: @cnpjlegal"), 14, fy);
  fy += 5;
  doc.text(sanitize("Site oficial: www.cnpjlegal.com.br"), 14, fy);

  // 8) Salvar
  const nomeArq = `CNPJ_Legal_${(d.cnpj || ultimoCNPJ || "relatorio").replace(/\D/g,'')}.pdf`;
  doc.save(nomeArq);
}

// Expor no escopo global
window.consultarCNPJ = consultarCNPJ;
window.enviarWhatsApp = enviarWhatsApp;
window.baixarConversa = baixarConversa;
