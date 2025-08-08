// =========================
// AVATARES
// =========================
const avatarBot  = "https://i.ibb.co/b5h1V8nd/i-cone.png";            // CNPJ Legal
const avatarUser = "https://i.ibb.co/8D2DQtrZ/icon-7797704-640.png";  // Usuário

// Estado global simples
let ultimoCNPJ = "";
window.dadosCNPJ = {};

// =========================
// UTIL
// =========================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function limparMascara(cnpj) {
  return (cnpj || "").replace(/\D/g, "");
}

// Adiciona bolha com avatar (bot ou user)
function addMensagem(texto, autor = 'bot') {
  if (!texto) return;
  const clean = String(texto).replace(/<[^>]*>?/gm, '').trim();
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

  // anima "..." -> ".." -> "." -> "..." em loop
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
async function botSay(texto, delay = 650) {
  const t = startTyping();
  await sleep(delay);
  stopTyping(t);
  addMensagem(texto, 'bot');
}

// =========================
// MÁSCARA CNPJ
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
    await botSay("⚠️ Digite um CNPJ válido com 14 números.", 450);
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
      await botSay(`❌ ${data.erro}`, 450);
      return;
    }

    ultimoCNPJ = input.value;
    window.dadosCNPJ = data;

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
    await botSay("❌ Erro ao consultar dados. Tente novamente mais tarde.", 450);
  }
}

// =========================
// FLUXO DE MENSAGENS
// =========================
function statusMensagem(status) {
  if (status === 'ativo')  return "✅ Seu CNPJ está ativo na Receita Federal. Identificamos possíveis pendências.";
  if (status === 'baixado')return "⚠️ Seu CNPJ está baixado (encerrado) e há débitos.";
  if (status === 'inapto') return "🚫 Seu CNPJ está inapto por pendências.";
  return "❌ Não foi possível identificar a situação.";
}

async function iniciarConversa(data) {
  if (data.responsavel?.trim()) await botSay(`Olá, ${data.responsavel}!`);
  else                          await botSay("Olá, empreendedor(a)!");

  if (data.status?.trim())                  await botSay(statusMensagem(data.status), 500);
  if (data.situacao_enquadramento?.trim())  await botSay(`📌 Situação do enquadramento: ${data.situacao_enquadramento}`, 400);
  if (data.declaracao_anual?.trim())        await botSay(`📄 Declaração Anual: ${data.declaracao_anual}`, 400);
  if (data.divida_ativa?.trim())            await botSay(`💰 Dívida ativa: ${data.divida_ativa}`, 400);
  if (data.valor_regularizacao?.trim())     await botSay(`💵 Valor estimado para regularização: ${data.valor_regularizacao}`, 400);
  if (data.cnae_principal?.trim())          await botSay(`🏢 CNAE Principal: ${data.cnae_principal}`, 350);
  if (data.natureza_juridica?.trim())       await botSay(`⚖️ Natureza Jurídica: ${data.natureza_juridica}`, 350);
  if (data.abertura?.trim())                await botSay(`📅 Data de Abertura: ${data.abertura}`, 350);
  if (data.logradouro?.trim())              await botSay(`📍 Endereço: ${data.logradouro}, ${data.numero || ''} - ${data.municipio}/${data.uf}`, 350);
  if (data.email?.trim())                   await botSay(`✉️ E-mail: ${data.email}`, 300);
  if (data.telefone?.trim())                await botSay(`📞 Telefone: ${data.telefone}`, 300);
  if (data.capital_social?.trim())          await botSay(`💼 Capital Social: ${data.capital_social}`, 300);

  // Botão "Continuar diagnóstico" (VERDE) que some após o clique e registra fala do usuário com avatar
  mostrarOpcoes(["Continuar diagnóstico"], async () => {
    addMensagem("Continuar diagnóstico", "user");
    await botSay("📋 Diagnóstico finalizado! Você pode iniciar a regularização ou consultar um novo CNPJ.", 550);
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
  const msg = `Realizei o diagnóstico automático e quero regularizar.%0A` +
              `📌 CNPJ: ${d.cnpj || ultimoCNPJ || ""}%0A` +
              `👤 Responsável: ${d.responsavel || ""}%0A` +
              `📊 Status: ${d.status || ""}%0A` +
              `🏢 Situação enquadramento: ${d.situacao_enquadramento || ""}%0A` +
              `📄 Declaração anual: ${d.declaracao_anual || ""}%0A` +
              `💰 Dívida ativa: ${d.divida_ativa || ""}%0A` +
              `💵 Valor regularização: ${d.valor_regularizacao || ""}`;

  const btnWhats = document.createElement('button');
  btnWhats.textContent = "Iniciar regularização";
  btnWhats.classList.add('verde'); // verde no final
  btnWhats.style.flex = "1";
  btnWhats.onclick = () => window.open(`https://wa.me/554396015785?text=${msg}`, '_blank');

  const btnNovo = document.createElement('button');
  btnNovo.textContent = "Consultar novo CNPJ"; // azul padrão via CSS .opcoes-botoes button
  btnNovo.style.flex  = "1";
  btnNovo.onclick = () => location.reload();

  div.appendChild(btnWhats);
  div.appendChild(btnNovo);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// =========================
// AÇÕES EXTERNAS
// =========================
function enviarWhatsApp() {
  const d = window.dadosCNPJ || {};
  const msg = `Realizei o diagnóstico automático e quero regularizar.%0A` +
              `📌 CNPJ: ${d.cnpj || ultimoCNPJ || ""}%0A` +
              `👤 Responsável: ${d.responsavel || ""}%0A` +
              `📊 Status: ${d.status || ""}%0A` +
              `🏢 Situação enquadramento: ${d.situacao_enquadramento || ""}%0A` +
              `📄 Declaração anual: ${d.declaracao_anual || ""}%0A` +
              `💰 Dívida ativa: ${d.divida_ativa || ""}%0A` +
              `💵 Valor regularização: ${d.valor_regularizacao || ""}`;
  window.open(`https://wa.me/554396015785?text=${msg}`, '_blank');
}

// Geração de PDF oficial (substitua sua função por esta)
async function baixarConversa() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // 1) Carrega uma fonte com suporte a acentos (Roboto)
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
    // fallback
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

  // 3) Tabela
  const linhas = [
    ["CNPJ", d.cnpj || "—"],
    ["Responsável", d.responsavel || "—"],
    ["Status", d.status || "—"],
    ["Enquadramento", d.situacao_enquadramento || "—"],
    ["Declaração anual", d.declaracao_anual || "—"],
    ["Dívida ativa", d.divida_ativa || "—"],
    ["Valor para regularização", d.valor_regularizacao || "—"],
    ["CNAE Principal", d.cnae_principal || "—"],
    ["Natureza Jurídica", d.natureza_juridica || "—"],
    ["Data de Abertura", d.abertura || "—"],
    ["Endereço", `${d.logradouro || ""} ${d.numero || ""} - ${d.municipio || ""}/${d.uf || ""}`.trim()],
    ["E-mail", d.email || "—"],
    ["Telefone", d.telefone || "—"],
    ["Capital Social", d.capital_social || "—"],
  ].map(([k, v]) => [sanitize(k), sanitize(v)]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: 34,
      head: [["Campo", "Informação"].map(sanitize)],
      body: linhas,
      theme: "striped",
      headStyles: { fillColor: [15, 62, 250], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } },
    });
  } else {
    // fallback simples
    let y = 40;
    doc.setFontSize(11);
    linhas.forEach(([k, v]) => {
      doc.text(`${k}: ${v}`, 14, y);
      y += 6;
    });
  }

  // 4) Chamada sem emoji + botão arredondado 100%
  let yPos = (doc.lastAutoTable?.finalY || 120) + 10;

  doc.setFontSize(14);
  doc.setTextColor(0, 180, 0);
  doc.text(sanitize("Regularize seu CNPJ agora mesmo!"), 14, yPos);

  doc.setTextColor(0, 0, 0);
  yPos += 8;
  doc.setFontSize(11);
  const desc = sanitize(
    "Entre em contato com nossa equipe pelo WhatsApp e receba suporte especializado."
  );
  doc.text(doc.splitTextToSize(desc, 182), 14, yPos);

  // Botão verde com bordas totalmente arredondadas
  const btnY = yPos + 12;
  const btnX = 14;
  const btnW = 95;
  const btnH = 12;
  const radius = btnH / 2; // 100% arredondado

  doc.setFillColor(23, 227, 13);
  if (doc.roundedRect) {
    doc.roundedRect(btnX, btnY, btnW, btnH, radius, radius, "F");
  } else {
    // fallback: rect normal se o roundedRect não existir
    doc.rect(btnX, btnY, btnW, btnH, "F");
  }
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(sanitize("Falar no WhatsApp"), btnX + 8, btnY + 8);

  const linkWhats = `https://wa.me/554396015785?text=${encodeURIComponent(
    "Quero regularizar meu CNPJ"
  )}`;
  doc.link(btnX, btnY, btnW, btnH, { url: linkWhats });

  // 5) Rodapé (sem emojis, com espaçamento ok)
  let fy = btnY + 22;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(sanitize("Instagram: @cnpjlegal"), 14, fy);
  fy += 5;
  doc.text(sanitize("Site oficial: www.cnpjlegal.com.br"), 14, fy);

  // 6) Salvar
  doc.save(`CNPJ_Legal_${(d.cnpj || "relatorio")}.pdf`);
}
