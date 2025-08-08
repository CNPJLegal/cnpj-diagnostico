// Máscara para CNPJ
document.getElementById('cnpjInput').addEventListener('input', function (e) {
    let v = e.target.value.replace(/\D/g, '').slice(0, 14);
    if (v.length > 2) v = v.replace(/(\d{2})(\d)/, '$1.$2');
    if (v.length > 6) v = v.replace(/(\d{3})(\d)/, '$1.$2');
    if (v.length > 10) v = v.replace(/(\d{3})(\d)/, '$1/$2');
    if (v.length > 15) v = v.replace(/(\d{4})(\d)/, '$1-$2');
    e.target.value = v;
});

function limparMascara(cnpj) {
    return cnpj.replace(/\D/g, '');
}

function addMensagemBot(texto) {
    if (!texto) return;
    const clean = texto.replace(/<[^>]*>?/gm, '')
                       .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
                       .trim();
    if (clean === "") return;
    document.getElementById('resultado').innerHTML += `<div class="msg-bot">${texto}</div>`;
}

async function consultarCNPJ() {
    const input = document.getElementById('cnpjInput');
    const botao = document.getElementById('consultarBtn');
    const cnpj = limparMascara(input.value);
    const chat = document.getElementById('resultado');

    chat.innerHTML = '';

    if (!cnpj || cnpj.length !== 14) {
        addMensagemBot("⚠️ Digite um CNPJ válido com 14 números.");
        return;
    }

    if (input.value.trim() !== "") {
        chat.innerHTML += `<div class="msg-user">${input.value}</div>`;
    }

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
            addMensagemBot(`❌ ${data.erro}`);
            return;
        }

        iniciarConversa(data);
    } catch (err) {
        document.getElementById('loadingSpinner')?.remove();
        addMensagemBot("❌ Erro ao consultar dados. Tente novamente mais tarde.");
    }
}

function iniciarConversa(data) {
    const chat = document.getElementById('resultado');

    if (data.responsavel?.trim()) {
        addMensagemBot(`Olá, ${data.responsavel}!`);
    } else {
        addMensagemBot("Olá, empreendedor(a)!");
    }

    if (data.status?.trim()) {
        addMensagemBot(statusMensagem(data.status));
    }

    if (data.situacao_enquadramento?.trim()) addMensagemBot(`📌 Situação do enquadramento: ${data.situacao_enquadramento}`);
    if (data.declaracao_anual?.trim()) addMensagemBot(`📄 Declaração Anual: ${data.declaracao_anual}`);
    if (data.divida_ativa?.trim()) addMensagemBot(`💰 Dívida ativa: ${data.divida_ativa}`);
    if (data.valor_regularizacao?.trim()) addMensagemBot(`💵 Valor estimado para regularização: ${data.valor_regularizacao}`);
    if (data.cnae_principal?.trim()) addMensagemBot(`🏢 CNAE Principal: ${data.cnae_principal}`);
    if (data.natureza_juridica?.trim()) addMensagemBot(`⚖️ Natureza Jurídica: ${data.natureza_juridica}`);
    if (data.abertura?.trim()) addMensagemBot(`📅 Data de Abertura: ${data.abertura}`);
    if (data.logradouro?.trim()) addMensagemBot(`📍 Endereço: ${data.logradouro}, ${data.numero || ''} - ${data.municipio}/${data.uf}`);
    if (data.email?.trim()) addMensagemBot(`✉️ E-mail: ${data.email}`);
    if (data.telefone?.trim()) addMensagemBot(`📞 Telefone: ${data.telefone}`);
    if (data.capital_social?.trim()) addMensagemBot(`💼 Capital Social: ${data.capital_social}`);

    window.dadosCNPJ = data;

    chat.innerHTML += `
        <div class="opcoes-botoes">
            <button class="btn-whats" onclick="mostrarBotoesFinais()">Continuar diagnóstico</button>
        </div>
    `;
}

function statusMensagem(status) {
    if (status === 'ativo') return "✅ Seu CNPJ está ativo na Receita Federal. No entanto, identificamos possíveis pendências.";
    if (status === 'baixado') return "⚠️ Seu CNPJ está baixado (encerrado) e há débitos.";
    if (status === 'inapto') return "🚫 Seu CNPJ está inapto por pendências.";
    return "❌ Não foi possível identificar a situação.";
}

function mostrarBotoesFinais() {
    const chat = document.getElementById('resultado');

    chat.innerHTML += `<div class="msg-user">Continuar diagnóstico</div>`;
    addMensagemBot("📋 Diagnóstico finalizado! Você pode iniciar a regularização ou consultar um novo CNPJ.");

    const div = document.createElement('div');
    div.className = 'opcoes-botoes';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginTop = '10px';

    const btnWhats = document.createElement('button');
    btnWhats.innerText = "Iniciar regularização";
    btnWhats.classList.add("btn-whats");
    btnWhats.style.flex = "1";
    btnWhats.onclick = enviarWhatsApp;

    const btnNovo = document.createElement('button');
    btnNovo.innerText = "Consultar novo CNPJ";
    btnNovo.style.background = "#0f3efa";
    btnNovo.style.color = "#fff";
    btnNovo.style.flex = "1";
    btnNovo.onclick = () => location.reload();

    const btnDownload = document.createElement('button');
    btnDownload.innerText = "Baixar conversa";
    btnDownload.style.background = "#555";
    btnDownload.style.color = "#fff";
    btnDownload.style.flex = "1";
    btnDownload.onclick = baixarConversa;

    div.appendChild(btnWhats);
    div.appendChild(btnNovo);
    div.appendChild(btnDownload);
    chat.appendChild(div);
}

function enviarWhatsApp() {
    const d = window.dadosCNPJ || {};
    const msg = `Realizei o diagnóstico automático e quero regularizar.%0A
📌 CNPJ: ${d.cnpj || ''}%0A
👤 Responsável: ${d.responsavel || ''}%0A
📊 Status: ${d.status || ''}%0A
🏢 Situação enquadramento: ${d.situacao_enquadramento || ''}%0A
📄 Declaração anual: ${d.declaracao_anual || ''}%0A
💰 Dívida ativa: ${d.divida_ativa || ''}%0A
💵 Valor regularização: ${d.valor_regularizacao || ''}`;
    window.open(`https://wa.me/554396015785?text=${msg}`, '_blank');
}

// Geração de PDF oficial
async function baixarConversa() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const d = window.dadosCNPJ || {};
    const dataHora = new Date().toLocaleString('pt-BR');

    // Adiciona logo
    const logoUrl = "https://i.ibb.co/b5mX0Xnj/Logo-CNPJ-Legal.png";
    const logoData = await fetch(logoUrl).then(res => res.blob()).then(blob => {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    });
    doc.addImage(logoData, 'PNG', 14, 10, 40, 15);

    doc.setFontSize(16);
    doc.text("Relatório Oficial - CNPJ Legal", 60, 18);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${dataHora}`, 60, 24);
    doc.line(14, 28, 196, 28);

    const linhas = [
        ["CNPJ", d.cnpj || '—'],
        ["Responsável", d.responsavel || '—'],
        ["Status", d.status || '—'],
        ["Enquadramento", d.situacao_enquadramento || '—'],
        ["Declaração anual", d.declaracao_anual || '—'],
        ["Dívida ativa", d.divida_ativa || '—'],
        ["Valor para regularização", d.valor_regularizacao || '—'],
        ["CNAE Principal", d.cnae_principal || '—'],
        ["Natureza Jurídica", d.natureza_juridica || '—'],
        ["Data de Abertura", d.abertura || '—'],
        ["Endereço", `${d.logradouro || ''} ${d.numero || ''} - ${d.municipio || ''}/${d.uf || ''}`],
        ["E-mail", d.email || '—'],
        ["Telefone", d.telefone || '—'],
        ["Capital Social", d.capital_social || '—']
    ];

    doc.autoTable({
        startY: 34,
        head: [["Campo", "Informação"]],
        body: linhas,
        theme: 'striped',
        headStyles: { fillColor: [15, 62, 250], textColor: 255 },
        styles: { fontSize: 10 }
    });

    let yPos = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setTextColor(23, 227, 13);
    doc.text("🚀 Regularize seu CNPJ agora mesmo!", 14, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 8;
    doc.setFontSize(11);
    doc.text("Entre em contato com nossa equipe pelo WhatsApp e receba suporte especializado.", 14, yPos);

    const linkWhats = `https://wa.me/554396015785?text=Quero%20regularizar%20meu%20CNPJ`;
    yPos += 10;
    doc.setFillColor(23, 227, 13);
    doc.rect(14, yPos, 80, 10, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text("💬 Falar no WhatsApp", 16, yPos + 7);
    doc.link(14, yPos, 80, 10, { url: linkWhats });

    yPos += 20;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("🔗 Instagram: @cnpjlegal", 14, yPos);
    doc.link(14, yPos - 3, 60, 6, { url: "https://instagram.com/cnpjlegal" });
    yPos += 5;
    doc.text("🌐 Site oficial: www.cnpjlegal.com.br", 14, yPos);
    doc.link(14, yPos - 3, 90, 6, { url: "https://www.cnpjlegal.com.br" });

    doc.save(`CNPJ_Legal_${(d.cnpj || 'relatorio')}.pdf`);
}
