// Aplica máscara no campo de CNPJ
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

    // Exibir CNPJ como mensagem do usuário
    chat.innerHTML += `<div class="msg-user">${input.value}</div>`;

    // Esconder campo e botão
    input.style.display = 'none';
    botao.style.display = 'none';

    // Adiciona spinner
    chat.innerHTML += `<div class="spinner"></div>`;

    try {
        const res = await fetch('/consultar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cnpj })
        });

        const data = await res.json();

        // Remove spinner
        document.querySelector('.spinner')?.remove();

        if (data.erro) {
            chat.innerHTML += `<div class="msg-bot">❌ ${data.erro}</div>`;
            return;
        }

        iniciarConversa(data);
    } catch (err) {
        document.querySelector('.spinner')?.remove();
        chat.innerHTML += `<div class="msg-bot">❌ Ocorreu um erro na comunicação com a Receita Federal. Tente novamente mais tarde.</div>`;
    }
}

function iniciarConversa(data) {
    const chat = document.getElementById('resultado');

    // Saudação
    chat.innerHTML += `<div class="msg-bot">Olá, ${data.responsavel || 'empreendedor(a)'}!</div>`;

    // Situação cadastral
    if (data.status === 'ativo') {
        chat.innerHTML += `<div class="msg-bot">✅ Seu CNPJ está ativo na Receita Federal. No entanto, identificamos possíveis pendências que podem ser regularizadas.</div>`;
    } else if (data.status === 'baixado') {
        chat.innerHTML += `<div class="msg-bot">⚠️ Seu CNPJ está baixado (encerrado) na Receita Federal. Ainda existem débitos que precisam ser quitados.</div>`;
    } else if (data.status === 'inapto') {
        chat.innerHTML += `<div class="msg-bot">🚫 Seu CNPJ está inapto perante a Receita Federal devido a pendências existentes.</div>`;
    } else {
        chat.innerHTML += `<div class="msg-bot">❌ Não foi possível identificar a situação cadastral do CNPJ.</div>`;
    }

    // Informações adicionais
    chat.innerHTML += `<div class="msg-bot">📌 Situação do enquadramento: ${data.situacao_enquadramento}</div>`;
    chat.innerHTML += `<div class="msg-bot">📄 Declaração Anual: ${data.declaracao_anual}</div>`;
    chat.innerHTML += `<div class="msg-bot">💰 Dívida ativa: ${data.divida_ativa}</div>`;
    chat.innerHTML += `<div class="msg-bot">💵 Valor estimado para regularização: ${data.valor_regularizacao}</div>`;

    // Campos extras
    if (data.cnae_principal) chat.innerHTML += `<div class="msg-bot">🏢 CNAE Principal: ${data.cnae_principal}</div>`;
    if (data.natureza_juridica) chat.innerHTML += `<div class="msg-bot">⚖️ Natureza Jurídica: ${data.natureza_juridica}</div>`;
    if (data.abertura) chat.innerHTML += `<div class="msg-bot">📅 Data de Abertura: ${data.abertura}</div>`;
    if (data.logradouro) chat.innerHTML += `<div class="msg-bot">📍 Endereço: ${data.logradouro}, ${data.numero || ''} - ${data.municipio}/${data.uf}</div>`;
    if (data.email) chat.innerHTML += `<div class="msg-bot">✉️ E-mail: ${data.email}</div>`;
    if (data.telefone) chat.innerHTML += `<div class="msg-bot">📞 Telefone: ${data.telefone}</div>`;
    if (data.capital_social) chat.innerHTML += `<div class="msg-bot">💼 Capital Social: ${data.capital_social}</div>`;

    // Salva dados para o WhatsApp
    window.dadosCNPJ = data;

    // Botão verde de continuar
    chat.innerHTML += `
        <div class="opcoes-botoes">
            <button style="background:#17e30d; color:#000; border:none; padding:8px 14px; border-radius:14px; cursor:pointer;" onclick="mostrarBotoesFinais()">Continuar diagnóstico</button>
        </div>
    `;
}

function mostrarBotoesFinais() {
    const chat = document.getElementById('resultado');
    chat.innerHTML += `<div class="msg-user">Continuar diagnóstico</div>`;
    chat.innerHTML += `<div class="msg-bot">📋 Diagnóstico finalizado! Você pode iniciar a regularização agora mesmo ou consultar um novo CNPJ.</div>`;

    const div = document.createElement('div');
    div.className = 'opcoes-botoes';

    const btnWhats = document.createElement('button');
    btnWhats.innerText = "Iniciar regularização";
    btnWhats.style.background = "#25D366";
    btnWhats.style.color = "#fff";
    btnWhats.onclick = () => {
        const d = window.dadosCNPJ || {};
        const msg = `Realizei o diagnóstico automático e quero dar continuidade à regularização.%0A
📌 CNPJ: ${d.cnpj || ''}%0A
👤 Responsável: ${d.responsavel || ''}%0A
📊 Status: ${d.status || ''}%0A
🏢 Situação enquadramento: ${d.situacao_enquadramento || ''}%0A
📄 Declaração anual: ${d.declaracao_anual || ''}%0A
💰 Dívida ativa: ${d.divida_ativa || ''}%0A
💵 Valor regularização: ${d.valor_regularizacao || ''}%0A
🏢 CNAE: ${d.cnae_principal || ''}%0A
⚖️ Natureza Jurídica: ${d.natureza_juridica || ''}%0A
📅 Abertura: ${d.abertura || ''}%0A
📍 Endereço: ${d.logradouro || ''}, ${d.numero || ''} - ${d.municipio || ''}/${d.uf || ''}%0A
✉️ E-mail: ${d.email || ''}%0A
📞 Telefone: ${d.telefone || ''}%0A
💼 Capital Social: ${d.capital_social || ''}`;
        window.open(`https://wa.me/554396015785?text=${msg}`, '_blank');
    };

    const btnNovo = document.createElement('button');
    btnNovo.innerText = "Consultar novo CNPJ";
    btnNovo.style.background = "#0f3efa";
    btnNovo.style.color = "#fff";
    btnNovo.onclick = () => {
        location.reload();
    };

    div.appendChild(btnWhats);
    div.appendChild(btnNovo);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}
