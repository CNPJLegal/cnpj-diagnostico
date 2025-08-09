// =========================
// CONFIG
// =========================
const USE_PGFN = false; // manter false enquanto não contratar a API da PGFN

// =========================
// AVATARES
// =========================
const avatarBot  = "https://i.ibb.co/b5h1V8nd/i-cone.png";
const avatarUser = "https://i.ibb.co/8D2DQtrZ/icon-7797704-640.png";

// Estado global simples
let ultimoCNPJ = "";
window.dadosCNPJ = {};
window.userAnswers = { dasnResposta: "nao_sei" };

// Estrutura das 5 telas do diagnóstico
window.diag = {
  tela1: null,                                   // Situação Cadastral (RFB/CNPJ)
  tela2: { status: USE_PGFN ? "PENDENTE" : "NAO_CONSULTADO", detalhes: null }, // PGFN/CPF
  tela3: null,                                   // DASN-SIMEI (pergunta ao usuário)
  tela4: null,                                   // PGMEI (sem API confiável)
  tela5: null                                    // SIMEI/Simples (enquadramento)
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
  return String(v ?? "").replace(/<[^>]*>?/gm, "").trim();
}

// remove qualquer tag interna tipo "/TEXTO..." no começo da string
function stripInternalTag(msg) {
  return String(msg).replace(/^\/[^\n]+?\s*\n?/i, '').trim();
}

// Adiciona bolha (permite HTML básico)
function addHTML(textoHTML, autor = 'bot') {
  const clean = String(textoHTML ?? "").trim();
  if (!clean) return;
  const chat = $('#resultado');
  const row = document.createElement('div');
  row.className = autor === 'bot' ? 'msg-bot' : 'msg-user';
  const avatar = autor === 'bot' ? avatarBot : avatarUser;
  row.innerHTML = `
    <img src="${avatar}" class="avatar" alt="${autor}">
    <span>${clean}</span>
  `;
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function addMensagem(texto, autor='bot'){ addHTML(safeText(texto), autor); }

// Animação de digitação
function startTyping() {
  const chat = $('#resultado');
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
async function botSayHTML(html, delay=450){
  const t = startTyping();
  await sleep(delay);
  stopTyping(t);
  addHTML(stripInternalTag(html).replace(/<(?!\/?(b|ul|ol|li|br)\b)[^>]*>/gi, ''), 'bot');
}
async function botSay(txt, delay=450){ await botSayHTML(safeText(txt), delay); }

// =========================
// HERO: chips → focar input + balão animado
// =========================
function prepararHeroChips(){
  document.querySelectorAll('.card-item').forEach(chip=>{
    chip.style.cursor = 'pointer';
    chip.setAttribute('data-focus','cnpjInput');
  });
  document.querySelectorAll('[data-focus="cnpjInput"]').forEach(el=>{
    el.onclick = ()=> {
      const input = $('#cnpjInput');
      input.scrollIntoView({behavior:'smooth', block:'center'});
      input.focus();
      const chat = $('#resultado');
      if (!chat.dataset.hintShown){
        chat.dataset.hintShown = '1';
        botSayHTML("<b>Digite o CNPJ</b> no campo acima e clique em <b>Consultar</b> para começar o diagnóstico.");
      }
    };
  });
}

// =========================
// MÁSCARA CNPJ
// =========================
$('#cnpjInput')?.addEventListener('input', function (e) {
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
  const input = $('#cnpjInput');
  const botao = $('#consultarBtn');
  const chat  = $('#resultado');

  const cnpj = limparMascara(input.value);
  chat.innerHTML = ''; // limpa

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
    $('#loadingSpinner')?.remove();

    if (data.erro) {
      await botSay(data.erro);
      input.style.display = '';
      botao.style.display = '';
      return;
    }

    ultimoCNPJ = input.value;
    window.dadosCNPJ = data;

    // NORMALIZAÇÕES/DEFAULTS
    const status = safeText(data.status || data.situacao || "");
    const simplesOptante = !!(data.simples_optante ?? data.simei?.optante ?? data.company?.simei?.optant);

    window.diag.tela1 = { status: status || "—" };
    window.diag.tela3 = { dasn_pendente: null }; // perguntaremos ao usuário
    window.diag.tela4 = { das_em_aberto: null }; // sem API confiável
    window.diag.tela5 = { simei_optante: simplesOptante };

    // mostrar botões fixos
    $('#btnDownload')?.classList.add('show');
    $('#btnRegularizar')?.classList.add('show');

    await iniciarConversa(data);

  } catch (err) {
    $('#loadingSpinner')?.remove();
    await botSay("Erro ao consultar dados. Tente novamente mais tarde.");
    input.style.display = '';
    botao.style.display = '';
  }
}

// =========================
// FLUXO
// =========================
function statusMensagem(status) {
  const s = (status || "").toLowerCase();
  if (s.includes('ativo'))  return "<b>Situação cadastral:</b> ativo.";
  if (s.includes('baixado'))return "<b>Situação cadastral:</b> baixado.";
  if (s.includes('inapto')) return "<b>Situação cadastral:</b> inapto.";
  return "<b>Situação cadastral:</b> não identificada.";
}

async function iniciarConversa(data) {
  if (safeText(data.responsavel)) await botSayHTML(`Olá, <b>${safeText(data.responsavel)}</b>.`);
  else                            await botSay("Olá.");

  if (window.diag.tela1?.status) await botSayHTML(statusMensagem(window.diag.tela1.status));

  // Etapa 2 — Dívida ativa (texto padrão)
  await botSayHTML(
    `<b>Dívida ativa</b><br>
    Devido ao não pagamento das taxas mensais do seu CNPJ, a dívida foi <b>transferida para o seu CPF</b>, tornando-se uma <b>dívida ativa com a Receita Federal</b>.<br><br>
    A dívida ativa pode acarretar consequências como:
    <ul>
      <li>Bloqueio de contas bancárias</li>
      <li>Bloqueio de maquininhas de cartão</li>
      <li>Impedimento de emissão de notas fiscais</li>
      <li>Penhora de bens</li>
      <li>Inclusão em cadastros de inadimplentes (SPC/SERASA)</li>
      <li>Envio da dívida para cartório, gerando custos adicionais</li>
    </ul>
    <b>Temos uma solução:</b> É possível conseguir <b>até 50% de desconto</b> e <b>parcelar</b> o saldo restante <b>em até 60 vezes</b>.`
  );

  // Etapa 5 — Enquadramento
  if (window.diag.tela5) {
    if (window.diag.tela5.simei_optante) {
      await botSayHTML(
        `<b>Enquadramento:</b> MEI (SIMEI).<br><br>
        A notícia positiva é que seu CNPJ <b>não foi desenquadrado do MEI</b>. Portanto, precisamos apenas regularizar as pendências para voltar à situação regular.<br><br>
        Se não resolver, o CNPJ pode ser desenquadrado do MEI e migrar para regimes com mais impostos e burocracia.`
      );
    } else {
      const st = (window.diag.tela1?.status || "").toLowerCase();
      const base =
        `Seu CNPJ foi <b>desenquadrado do MEI (SIMEI)</b> e agora está no <b>Simples Nacional</b>.<br>
         Implicações:
         <ul>
           <li>Impostos sobre o faturamento (mínimo <b>6%</b> para serviços)</li>
           <li>Declarações mensais e anuais obrigatórias; a falta gera <b>multas</b></li>
         </ul>`;
      await botSayHTML(
        `<b>Enquadramento:</b> ${st.includes('inapto') ? 'inapto e ' : ''}desenquadrado do MEI (Simples Nacional).<br><br>${base}`
      );
    }
  }

  // Etapa 3 — Pergunta DASN
  await perguntarDASN();
}

async function perguntarDASN(){
  await botSayHTML(`Sobre a <b>Declaração Anual de Faturamento (DASN-SIMEI)</b> do ano passado, você já entregou?`);
  mostrarOpcoes(
    [
      {label:"Ainda não", value:"ainda_nao", classe:"verde"},
      {label:"Já declarei", value:"ja_declarei"},
      {label:"Não sei", value:"nao_sei"}
    ],
    async (val, label)=>{
      addMensagem(label, 'user');
      window.userAnswers.dasnResposta = val;

      if (val === "ainda_nao"){
        window.diag.tela3 = { dasn_pendente: true };
        const st = (window.diag.tela1?.status || "").toLowerCase();
        if (st.includes('baixado')){
          await botSayHTML(`<b>Declaração Anual:</b> <b>pendente</b> (declaração especial de encerramento). Multa estimada ~<b>R$ 50,00</b>.`);
        } else {
          await botSayHTML(`<b>Declaração Anual:</b> <b>pendente</b>. Multa estimada ~<b>R$ 25,00</b>.`);
        }
      } else if (val === "ja_declarei"){
        window.diag.tela3 = { dasn_pendente: false };
        await botSayHTML(`<b>Declaração Anual:</b> em dia (será validado por um especialista durante a regularização).`);
      } else {
        window.diag.tela3 = { dasn_pendente: null };
        await botSayHTML(`Vamos prosseguir; essa informação será conferida por um especialista e registrada no PDF.`);
      }

      // Proposta – texto completo
      const proposta = montarPropostaCompleta(window.diag);
      await botSayHTML(proposta.previewMsg);

      // Aviso pagamento hoje + CTA
      await botSayHTML(
        `Para prosseguir, você deverá <b>efetuar o pagamento</b> assim que o processo for <b>concluído</b> e a situação estiver <b>100% regularizada</b> — isso é concluído <b>hoje mesmo</b>. Se estiver ciente e quiser continuar, clique em <b>“Quero prosseguir”</b>.`
      );

      mostrarOpcoes(
        [
          {label:"Quero prosseguir", value:"ok", classe:"verde"},
          {label:"Consultar outro CNPJ", value:"novo"}
        ],
        async (v,l)=>{
          addMensagem(l,'user');
          if (v==="ok"){
            // Documentos conforme a proposta
            await botSayHTML(proposta.docMensagemHTML);

            // Pergunta: possui o valor hoje?
            await botSayHTML(`Você possui o investimento <b>hoje</b> para pagamento após a conclusão?`);
            mostrarOpcoes(
              [
                {label:"Sim", value:"sim", classe:"verde"},
                {label:"Ainda não", value:"nao"}
              ],
              async (v2, l2)=>{
                addMensagem(l2,'user');
                if (v2 === "sim"){
                  // Botão para abrir WhatsApp (rótulo pedido)
                  mostrarOpcoes(
                    [{label:"Continuar a regularização", value:"zap", classe:"verde"}],
                    ()=>{
                      enviarWhatsAppComContexto(proposta);
                      // Depois que abrir o Whats, oferece ações finais no chat
                      mostrarAposWhats();
                    }
                  );
                } else {
                  mostrarAposWhats(false); // sem abrir Whats
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

function mostrarOpcoes(opcoes, onClick){
  const chat = $('#resultado');
  const div  = document.createElement('div');
  div.className = 'opcoes-botoes';

  opcoes.forEach(o=>{
    const btn = document.createElement('button');
    btn.textContent = o.label;
    if (o.classe === 'verde') btn.classList.add('verde');
    btn.onclick = ()=>{ div.remove(); onClick(o.value, o.label); };
    div.appendChild(btn);
  });

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function mostrarAposWhats(opened = true){
  if (opened) addHTML(`<b>Perfeito!</b> Você foi direcionado para nosso WhatsApp para continuar a regularização.`, 'bot');
  mostrarOpcoes(
    [
      {label:"Baixar Diagnóstico (PDF)", value:"pdf", classe:"verde"},
      {label:"Consultar novo CNPJ", value:"novo"}
    ],
    (v)=>{
      if (v==="pdf") baixarConversa();
      if (v==="novo") location.reload();
    }
  );
}

// =========================
// PROPOSTAS (texto COMPLETO — sem tags)
// =========================
function montarPropostaCompleta(diag){
  const VAL = 399;
  const VAL2 = `2× de R$ ${VAL}`;

  const status = (diag.tela1?.status || "").toLowerCase();
  const ativo   = status.includes('ativo');
  const inapto  = status.includes('inapto');
  const baixado = status.includes('baixado');
  const simei   = !!diag.tela5?.simei_optante;

  if ((ativo || inapto) && simei){
    const valor  = `R$ ${VAL}`;
    const corpo = [
      "Parcelamento da Dívida Ativa no CPF, buscando redução e parcelamento prolongado.",
      "Parcelamento das guias mensais (DAS) em aberto no CNPJ.",
      "Entrega das declarações anuais de faturamento (DASN-SIMEI) pendentes."
    ];
    const previewMsg =
      `<b>Regularização MEI</b><br>
       Para regularizar sua situação, nosso serviço inclui:
       <ul>${corpo.map(i=>`<li>${i}</li>`).join("")}</ul>
       <b>Investimento:</b> <b>${valor}</b>. Pagamento à vista (PIX/débito) ou em até 10x no cartão.`;
    const docMsg =
      `<b>Ótimo!</b> Para darmos o primeiro passo, precisamos:
       <ul>
         <li>Nome completo da mãe</li>
         <li>Nome completo do pai</li>
         <li>Data de nascimento</li>
         <li>Número do CPF</li>
       </ul>
       Você pode enviar digitado ou foto do RG/CNH (frente/verso). Após recebermos seus dados, nossa equipe confirmará os próximos passos e enviará as instruções para o pagamento do investimento inicial de <b>${valor}</b> (realizado após a negociação da dívida).`;
    return { previewMsg, docMensagemHTML: docMsg, tipo:"MEI" };
  }

  if (baixado){
    const valor = `R$ ${VAL}`;
    const previewMsg =
      `<b>CNPJ já baixado — Negociação de dívida no CPF</b><br>
       As guias DAS não pagas geraram uma <b>dívida vinculada ao seu CPF</b>. Vamos <b>negociar</b> e <b>parcelar</b> com boas condições.
       <br><b>Investimento:</b> <b>${valor}</b>.`;
    const docMsg =
      `<b>Ótimo!</b> Para iniciar a negociação/parcelamento no CPF, precisamos:
       <ul>
         <li>Nome completo da mãe</li>
         <li>Nome completo do pai</li>
         <li>Data de nascimento</li>
         <li>CPF</li>
       </ul>
       Envie digitado ou foto do RG/CNH. Após análise, enviaremos as instruções para pagamento de <b>${valor}</b>.`;
    return { previewMsg, docMensagemHTML: docMsg, tipo:"BAIXADO" };
  }

  if (ativo && !simei){
    const valor = `R$ ${VAL}`;
    const previewMsg =
      `<b>1ª fase — Regularização do período MEI</b><br>
       Primeiro passo para organizar sua situação:
       <ul>
         <li>Análise fiscal completa</li>
         <li>Regularização de DAS em aberto do período MEI</li>
         <li>Entrega de DASN-SIMEI em atraso</li>
         <li>Orientação sobre o regime atual (SN/LP)</li>
       </ul>
       <b>Investimento:</b> <b>${valor}</b>.`;
    const docMsg =
      `<b>Ótimo!</b> Para iniciar a 1ª fase, precisamos:
       <ul>
         <li>Nome completo da mãe</li>
         <li>Nome completo do pai</li>
         <li>Data de nascimento</li>
         <li>CPF</li>
       </ul>
       Após análise, enviaremos as instruções para pagamento de <b>${valor}</b>.`;
    return { previewMsg, docMensagemHTML: docMsg, tipo:"ATIVO_DESENQ" };
  }

  if (!simei && (ativo || inapto)){
    const valor = `${VAL2} (total R$ ${VAL*2})`;
    const previewMsg =
      `<b>Regularizar e baixar o CNPJ</b><br>
       Processo completo:
       <ol>
         <li><b>R$ ${VAL}</b>: Regularização MEI (DAS + DASN)</li>
         <li><b>R$ ${VAL}</b>: Baixa no regime atual (SN/LP) na Receita e Junta</li>
       </ol>
       <b>Investimento:</b> ${valor}.`;
    const docMsg =
      `<b>Excelente decisão!</b> Para iniciarmos o processo completo, precisamos:
       <ul>
         <li>CPF</li>
         <li>Data de nascimento</li>
         <li>Nome completo da mãe</li>
         <li>Nome completo do pai</li>
       </ul>
       Envie foto do RG/CNH se preferir. Após recebermos os dados, confirmaremos detalhes e enviaremos as instruções para pagar a <b>1ª parcela (R$ ${VAL})</b> após a negociação da Dívida Ativa. A <b>2ª parcela (R$ ${VAL})</b> é paga na conclusão da baixa.`;
    return { previewMsg, docMensagemHTML: docMsg, tipo:"BAIXA" };
  }

  // fallback
  const valor = `R$ ${VAL}`;
  const previewMsg = `<b>Regularização Fiscal</b><br><b>Investimento:</b> <b>${valor}</b>.`;
  const docMsg = `Para iniciar, envie: nome da mãe, nome do pai, data de nascimento e CPF. Após análise, enviamos as instruções de pagamento de <b>${valor}</b>.`;
  return { previewMsg, docMensagemHTML: docMsg, tipo:"PADRAO" };
}

// =========================
// AÇÕES EXTERNAS
// =========================
function enviarWhatsApp(){
  enviarWhatsAppComContexto(montarPropostaCompleta(window.diag));
}
function enviarWhatsAppComContexto(prop){
  const d = window.dadosCNPJ || {};
  const msg =
`Realizei o diagnóstico e quero regularizar.
CNPJ: ${d.cnpj || ultimoCNPJ || ""}
Status: ${window.diag.tela1?.status || ""}
Proposta: ${stripInternalTag(prop.previewMsg).replace(/<[^>]+>/g,'')}`;
  window.open(`https://wa.me/554396015785?text=${encodeURIComponent(msg)}`, '_blank');
}

// =========================
— PDF
// =========================
async function baixarConversa(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // fonte Roboto
  try{
    const fontUrl = "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf";
    const ab = await fetch(fontUrl).then(r=>r.arrayBuffer());
    const b64 = btoa(Array.from(new Uint8Array(ab)).map(b=>String.fromCharCode(b)).join(""));
    doc.addFileToVFS("Roboto-Regular.ttf", b64);
    doc.addFont("Roboto-Regular.ttf","Roboto","normal");
    doc.setFont("Roboto","normal");
  }catch{ doc.setFont("helvetica","normal"); }

  const sanitize = (s="")=>String(s).replace(/[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/gu,"");
  const d = window.dadosCNPJ || {};
  const dataHora = new Date().toLocaleString("pt-BR");

  // Cabeçalho
  try {
    const logoUrl = "https://i.ibb.co/b5mX0Xnj/Logo-CNPJ-Legal.png";
    const logoBlob = await fetch(logoUrl).then(res => res.blob());
    const logoData = await new Promise(r=>{const fr=new FileReader();fr.onloadend=()=>r(fr.result);fr.readAsDataURL(logoBlob);});
    doc.addImage(logoData, "PNG", 14, 10, 40, 15);
  } catch {}
  doc.setFontSize(16); doc.text(sanitize("Relatório Oficial - CNPJ Legal"), 60, 18);
  doc.setFontSize(10); doc.text(sanitize(`Gerado em: ${dataHora}`), 60, 24);
  doc.line(14,28,196,28);

  // Cadastrais
  const linhas = [
    ["CNPJ", d.cnpj || ultimoCNPJ || "—"],
    ["Razão Social", d.razao_social || d.company?.name || "—"],
    ["Situação Cadastral", window.diag.tela1?.status || "—"],
    ["Enquadramento", window.diag.tela5?.simei_optante===true?"MEI (SIMEI)":(window.diag.tela5?.simei_optante===false?"Desenquadrado do MEI":"—")]
  ].map(([k,v])=>[sanitize(k), sanitize(String(v))]);
  if (doc.autoTable){
    doc.autoTable({startY:34, head:[["Campo","Informação"]], body:linhas, theme:"striped",
      headStyles:{fillColor:[15,62,250],textColor:255}, styles:{fontSize:10,cellPadding:3}, columnStyles:{0:{cellWidth:60},1:{cellWidth:120}}});
  }

  // Resumo das 5 telas
  const dsum = [
    ["T1 — Situação Cadastral (RFB)", window.diag.tela1?.status || "—"],
    ["T2 — Dívida Ativa (PGFN/CPF)", USE_PGFN ? (window.diag.tela2?.status || "—") : "Consulta não realizada nesta etapa"],
    ["T3 — Declaração Anual (DASN-SIMEI)", window.userAnswers.dasnResposta==="ainda_nao"?"Pendente":(window.userAnswers.dasnResposta==="ja_declarei"?"Em dia":"Informado: não sabe")],
    ["T4 — Débitos DAS (PGMEI)", "Não avaliado automaticamente"],
    ["T5 — Enquadramento (SIMEI/SN/LP)", window.diag.tela5?.simei_optante===true?"MEI (SIMEI)":(window.diag.tela5?.simei_optante===false?"Desenquadrado do MEI":"—")]
  ];
  if (doc.autoTable){
    doc.autoTable({startY:(doc.lastAutoTable?.finalY||34)+6, head:[["Etapa","Resultado"]], body:dsum, theme:"striped",
      headStyles:{fillColor:[15,62,250],textColor:255}, styles:{fontSize:10,cellPadding:3}});
  }

  // Proposta resumida
  const prop = montarPropostaCompleta(window.diag);
  let y = (doc.lastAutoTable?.finalY || 110) + 10;
  doc.setFontSize(14); doc.text("Proposta Sugerida",14,y); y+=6;
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(sanitize(stripInternalTag(prop.previewMsg).replace(/<[^>]+>/g,'')), 182),14,y);

  // CTA WhatsApp
  y += 16;
  doc.setFontSize(11);
  doc.text("Entre em contato pelo WhatsApp para avançarmos com a regularização.", 14, y);
  const btnY = y+6, btnX=14, btnW=95, btnH=12, radius=btnH/2;
  doc.setFillColor(23,227,13);
  if (doc.roundedRect) doc.roundedRect(btnX,btnY,btnW,btnH,radius,radius,"F"); else doc.rect(btnX,btnY,btnW,btnH,"F");
  doc.setTextColor(0,0,0); doc.setFontSize(11); doc.text("Falar no WhatsApp", btnX+8, btnY+8);
  const link = `https://wa.me/554396015785?text=${encodeURIComponent("Quero regularizar meu CNPJ")}`;
  doc.link(btnX,btnY,btnW,btnH,{url:link});

  // Rodapé
  doc.setTextColor(100); doc.setFontSize(9);
  doc.text("Instagram: @cnpjlegal",14,btnY+22);
  doc.text("Site oficial: www.cnpjlegal.com.br",14,btnY+27);

  const nomeArq = `CNPJ_Legal_${(d.cnpj || ultimoCNPJ || "relatorio").replace(/\D/g,'')}.pdf`;
  doc.save(nomeArq);
}

// Expor
window.consultarCNPJ = consultarCNPJ;
window.enviarWhatsApp = enviarWhatsApp;
window.baixarConversa = baixarConversa;

// init
document.addEventListener('DOMContentLoaded', prepararHeroChips);
