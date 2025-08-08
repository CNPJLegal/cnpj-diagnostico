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

    chat.innerHTML += `<div class="spinner"></div>`;

    try {
        const res = await fetch('/consultar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cnpj })
        });

        const data = await res.json();
        chat.innerHTML = `<div class="msg-user">${input.value}</div>`; // mantém CNPJ no topo

        if (data.erro) {
            chat.innerHTML += `<div class="msg-bot">❌ ${data.erro}</div>`;
            return;
        }

        iniciarConversa(data);
    } catch (err) {
        chat.innerHTML += `<div class="msg-bot">❌ Erro ao consultar: ${err.message}</div>`;
    }
}

function iniciarConversa(data) {
    const chat = document.getElementById('resultado');

    // Saudação
    chat.innerHTML += `<div class="msg-bot">Olá, ${data.responsavel || 'empreendedor(a)'}!</div>`;

    // Diagnóstico
    if (data.status === 'ativo') {
        chat.innerHTML += `<div class="msg-bot">Confirmamos que seu CNPJ está ativo na Receita Federal. No entanto, identificamos a existência de guias de pagamento mensais pendentes.</div>`;
    } else if (data.status === 'baixado') {
        chat.innerHTML += `<div class="msg-bot">Seu CNPJ está baixado (encerrado) na Receita Federal. Mesmo com o CNPJ baixado, ainda existem valores em aberto que precisam ser regularizados.</div>`;
    } else if (data.status === 'inapto') {
        chat.innerHTML += `<div class="msg-bot">Seu CNPJ está inapto perante a Receita Federal devido a pendências existentes.</div>`;
    }

    // Dívida ativa
    if (data.divida_ativa) {
        chat.innerHTML += `<div class="msg-bot">Devido ao não pagamento das taxas mensais do seu CNPJ, a dívida foi transferida para o seu CPF, tornando-se uma dívida ativa com a Receita Federal.</div>`;
    }

    // Botão verde de continuar
    chat.innerHTML += `<div class="msg-bot">
        <button style="background:#17e30d; color:#000; border:none; padding:8px 14px; border-radius:14px; cursor:pointer;" onclick="mostrarProposta()">Continuar diagnóstico</button>
    </div>`;
}

function mostrarProposta() {
    const chat = document.getElementById('resultado');
    chat.innerHTML += `<div class="msg-user">Continuar diagnóstico</div>`;
    chat.innerHTML += `<div class="msg-bot">📋 Agora vamos verificar se há dívida ativa vinculada ao seu CPF...</div>`;
}

function encerrar() {
    const chat = document.getElementById('resultado');
    chat.innerHTML += `<div class="msg-user">Não</div>`;
    chat.innerHTML += `<div class="msg-bot">Entendido. Se precisar, estaremos à disposição no futuro!</div>`;
}
