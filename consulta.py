# consulta.py
import logging
import random

logger = logging.getLogger(__name__)

def diagnostico_cnpj(cnpj: str, captcha_resposta: str = None) -> dict:
    """
    Realiza um diagnóstico simulado do CNPJ.
    Compatível com ambientes serverless (Vercel) e sem Selenium.

    Retorna:
        - status: "ativo" | "baixado" | "inapto"
        - situacao_enquadramento: descrição da situação MEI
        - declaracao_anual: "Entregue" ou "Pendente"
        - divida_ativa: valor fictício para protótipo
        - demais_debitos: placeholder (não identificado no protótipo)
        - valor_regularizacao: valor real ou fictício informado
    """

    if not cnpj or len(cnpj) != 14 or not cnpj.isdigit():
        logger.error("CNPJ inválido recebido")
        return {"erro": "CNPJ inválido. Informe apenas números, total de 14 dígitos."}

    logger.info(f"Simulando consulta para CNPJ: {cnpj}")

    # Simulação de status
    status_possiveis = ["ativo", "baixado", "inapto"]
    status = random.choice(status_possiveis)

    # Construindo diagnóstico simulado
    resultado = {
        "status": status,
        "situacao_enquadramento": "MEI regular" if status == "ativo" else "MEI irregular",
        "declaracao_anual": "Entregue" if random.random() > 0.3 else "Pendente",
        "divida_ativa": f"R$ {random.randint(0, 5000):,}".replace(",", "."),
        "demais_debitos": "Não identificado no protótipo",
        "valor_regularizacao": "R$ 1.200,00"  # Substituir pelo valor real quando disponível
    }

    logger.info(f"Diagnóstico simulado retornado: {resultado}")
    return resultado
