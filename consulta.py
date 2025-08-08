# consulta.py
import logging
import requests

logger = logging.getLogger(__name__)

def diagnostico_cnpj(cnpj: str, captcha_resposta: str = None) -> dict:
    """
    Consulta dados reais do CNPJ usando a API pública ReceitaWS
    (https://receitaws.com.br/v1/cnpj/{cnpj})
    
    Retorna:
        - responsavel: Nome da empresa ou titular (MEI)
        - status: "ativo", "baixado", "inapto" (conforme Receita)
        - situacao_enquadramento: MEI regular ou irregular
        - declaracao_anual: Placeholder (necessita integração PGMEI)
        - divida_ativa: Placeholder (necessita integração PGFN)
        - demais_debitos: Placeholder
        - valor_regularizacao: Placeholder
    """

    if not cnpj or len(cnpj) != 14 or not cnpj.isdigit():
        logger.error("CNPJ inválido recebido")
        return {"erro": "CNPJ inválido. Informe apenas números, total de 14 dígitos."}

    logger.info(f"Consultando dados reais para CNPJ: {cnpj}")

    try:
        url = f"https://receitaws.com.br/v1/cnpj/{cnpj}"
        resp = requests.get(url, timeout=15)
        dados = resp.json()

        if "status" in dados and dados["status"] == "ERROR":
            return {"erro": dados.get("message", "Erro ao consultar CNPJ.")}

        responsavel = dados.get("nome") or dados.get("fantasia") or "Empreendedor(a)"
        situacao_rf = dados.get("situacao", "").lower()

        # Mapeando status para nosso fluxo
        if "ativa" in situacao_rf:
            status = "ativo"
        elif "baixada" in situacao_rf or "baixado" in situacao_rf:
            status = "baixado"
        else:
            status = "inapto"

        resultado = {
            "responsavel": responsavel,
            "status": status,
            "situacao_enquadramento": "MEI regular" if status == "ativo" else "MEI irregular",
            "declaracao_anual": "Desconhecido (necessária integração PGMEI)",
            "divida_ativa": "Desconhecido (necessária integração PGFN)",
            "demais_debitos": "Não identificado (protótipo)",
            "valor_regularizacao": "A calcular com dados reais"
        }

        logger.info(f"Diagnóstico real retornado: {resultado}")
        return resultado

    except Exception as e:
        logger.exception("Erro ao consultar API de CNPJ")
        return {"erro": f"Erro ao consultar CNPJ: {str(e)}"}
