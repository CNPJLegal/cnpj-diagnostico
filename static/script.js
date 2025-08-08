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
    const cnpj = limparMascara(input.value);
    const chat = document.getElementById('resultado');

    chat.innerHTML = '';

    if (!cnpj || cnpj.length !== 14) {
        chat.innerHTML = `<div class="msg-bot">⚠️ Digite um CNPJ válido com 14 números.</div>`;
        return;
    }

    chat.innerHTML = `<div class="msg-user">${input.value}</div><div class="spinner"></div>`;

    try {
        const res = await fetch('/consultar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cnpj })
        });

        const data = await res.json();
        chat.innerHTML = '';

        if (data.erro) {
            chat.innerHTML = `<div class="msg-bot">❌ ${data.erro}</div>`;
            return;
        }

        iniciarConversa(data);
    } catch (err) {
        chat.innerHTML = `<div class="msg-bot">❌ Erro ao consultar: ${err.message}</div>`;
    }
}

function iniciarConversa(data) {
    const chat = document.getElementById('resultado');

    // 1 - Saudação
    chat.innerHTML += `<div class="msg-bot">Olá, ${data.responsavel || 'empreendedor(a)'}!</div>`;

    // 2 - Diagnóstico da situação cadastral
    if (data.status === 'ativo') {
        chat.innerHTML += `<div class="msg-bot">Confirmamos que seu CNPJ está ativo na Receita Federal. No entanto, identificamos a existência de guias de pagamento mensais pendentes.</div>`;
    } else if (data.status === 'baixado') {
        chat.innerHTML += `<div class="msg-bot">Seu CNPJ está baixado (encerrado) na Receita Federal. Mesmo com o CNPJ baixado, ainda existem valores em aberto que precisam ser regularizados.</div>`;
    } else if (data.status === 'inapto') {
        chat.innerHTML += `<div class="msg-bot">Seu CNPJ está inapto perante a Receita Federal devido a pendências existentes.</div>`;
    }

    // 3 - Diagnóstico dívida ativa
    if (data.divida_ativa) {
        chat.innerHTML += `<div class="msg-bot">Devido ao não pagamento das taxas mensais do seu CNPJ, a dívida foi transferida para o seu CPF, tornando-se uma dívida ativa com a Receita Federal.</div>`;
    }

    // 4 - Próxima etapa — botão de continuar
    chat.innerHTML += `<div class="msg-bot">Deseja saber como regularizar?</div>`;
    chat.innerHTML += `<div class="msg-bot">
        <button onclick="mostrarProposta()">Sim</button>
        <button onclick="encerrar()">Não</button>
    </div>`;
}

function mostrarProposta() {
    const chat = document.getElementById('resultado');
    chat.innerHTML += `<div class="msg-user">Sim</div>`;
    chat.innerHTML += `<div class="msg-bot">Podemos conseguir até 50% de desconto e parcelamento em até 60 vezes. O investimento inicial é de R$ 349. Você quer prosseguir?</div>`;
}

function encerrar() {
    const chat = document.getElementById('resultado');
    chat.innerHTML += `<div class="msg-user">Não</div>`;
    chat.innerHTML += `<div class="msg-bot">Entendido. Se precisar, estaremos à disposição no futuro!</div>`;
}
