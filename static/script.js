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

async function consultarCNPJ() {
    const input = document.getElementById('cnpjInput');
    const botao = document.getElementById('consultarBtn');
    const cnpj = limparMascara(input.value);
    const chat = document.getElementById('resultado');

    chat.innerHTML = '';

    if (!cnpj || cnpj.length !== 14) {
        chat.innerHTML += `<div class="msg-bot">⚠️ Digite um CNPJ válido com 14 números.</div>`;
        return;
    }

    // Mensagem do usuário com estilo cinza claro
    chat.innerHTML += `<div class="msg-user" style="background:#f1f1f1; padding:10px; border-radius:12px; display:inline-block; margin:5px 0;">${input.value}</div>`;

    input.style.display = 'none';
    botao.style.display = 'none';

    chat.innerHTML += `<div class="spinner"></div>`;

    try {
        const res = await fetch('/consultar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cnpj })
        });

        const data = await res.json();

        document.querySelector('.spinner')?.remove();

        if (data.erro) {
            chat.innerHTML += `<div class="msg-bot">❌ ${data.erro}</div>`;
            return;
        }

        iniciarConversa(data);
    } catch (err) {
        document.querySelector('.spinner')?.remove();
        chat.innerHTML += `<div class="msg-bot">❌ Erro ao consultar dados. Tente novamente mais tarde.</div>`;
    }
}

function iniciarConversa(data) {
    const chat = document.getElementById('resultado');

    // Saudação apenas se existir nome ou texto
    if (data.responsavel && data.responsavel.trim() !== "") {
        chat.innerHTML += `<div class="msg-bot">Olá, ${data.responsavel}!</div>`;
    } else {
        chat.innerHTML += `<div class="msg-bot">Olá, empreendedor(a)!</div>`;
    }

    // Status cadastral
    if (data.status && data.status.trim() !== "") {
        chat.innerHTML += `<div class="msg-bot">${statusMensagem(data.status)}</div>`;
    }

    // Demais campos (adiciona só se não estiver vazio)
    if (data.situacao_enquadramento) 
        chat.innerHTML += `<div class="msg-bot">📌 Situação do enquadramento: ${data.situacao_enquadramento}</div>`;
    if (data.declaracao_anual) 
        chat.innerHTML += `<div class="msg-bot">📄 Declaração Anual: ${data.declaracao_anual}</div>`;
    if (data.divida_ativa) 
        chat.innerHTML += `<div class="msg-bot">💰 Dívida ativa: ${data.divida_ativa}</div>`;
    if (data.valor_regularizacao) 
        chat.innerHTML += `<div class="msg-bot">💵 Valor estimado para regularização: ${data.valor_regularizacao}</div>`;
    if (data.cnae_principal) 
        chat.innerHTML += `<div class="msg-bot">🏢 CNAE Principal: ${data.cnae_principal}</div>`;
    if (data.natureza_juridica) 
        chat.innerHTML += `<div class="msg-bot">⚖️ Natureza Jurídica: ${data.natureza_juridica}</div>`;
    if (data.abertura) 
        chat.innerHTML += `<div class="msg-bot">📅 Data de Abertura: ${data.abertura}</div>`;
    if (data.logradouro) 
        chat.innerHTML += `<div class="msg-bot">📍 Endereço: ${data.logradouro}, ${data.numero || ''} - ${data.municipio}/${data.uf}</div>`;
    if (data.email) 
        chat.innerHTML += `<div class="msg-bot">✉️ E-mail: ${data.email}</div>`;
    if (data.telefone) 
        chat.innerHTML += `<div class="msg-bot">📞 Telefone: ${data.telefone}</div>`;
    if (data.capital_social) 
        chat.innerHTML += `<div class="msg-bot">💼 Capital Social: ${data.capital_social}</div>`;

    window.dadosCNPJ = data;

    // Botão verde continuar
    chat.innerHTML += `
        <div class="opcoes-botoes">
            <button style="background:#17e30d; color:#000; border:none; padding:8px 14px; border-radius:14px; cursor:pointer;" onclick="mostrarBotoesFinais()">Continuar diagnóstico</button>
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

    chat.innerHTML += `<div class="msg-user" style="background:#f1f1f1; padding:10px; border-radius:12px; display:inline-block; margin:5px 0;">Continuar diagnóstico</div>`;
    chat.innerHTML += `<div class="msg-bot">📋 Diagnóstico finalizado! Você pode iniciar a regularização ou consultar um novo CNPJ.</div>`;

    const div = document.createElement('div');
    div.className = 'opcoes-botoes';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginTop = '10px';

    const btnWhats = document.createElement('button');
    btnWhats.innerText = "Iniciar regularização";
    btnWhats.style.background = "#17e30d";
    btnWhats.style.color = "#000";
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

function baixarConversa() {
    const chat = document.getElementById('resultado').innerText;
    const blob = new Blob([chat], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conversa_cnpj_${Date.now()}.txt`;
    link.click();
}
