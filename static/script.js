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

// Adiciona mensagens do bot filtrando vazias ou só emoji
function addMensagemBot(texto) {
    if (!texto) return;
    const clean = texto.replace(/<[^>]*>?/gm, '') // remove HTML
                       .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // remove emojis
                       .trim();
    if (clean === "") return; // ignora mensagens sem texto real
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

    // Mensagem do usuário (só se houver texto)
    if (input.value.trim() !== "") {
        chat.innerHTML += `<div class="msg-user">${input.value}</div>`;
    }

    input.style.display = 'none';
    botao.style.display = 'none';

    // Spinner fora do balão
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

    // Saudação
    if (data.responsavel?.trim()) {
        addMensagemBot(`Olá, ${data.responsavel}!`);
    } else {
        addMensagemBot("Olá, empreendedor(a)!");
    }

    // Status
    if (data.status?.trim()) {
        addMensagemBot(statusMensagem(data.status));
    }

    // Campos adicionais
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

    // Botão continuar
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
    btnWhats.classList.add("btn-whats"); // usa a classe do CSS
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
