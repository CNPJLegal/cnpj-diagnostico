import logging
import requests

logger = logging.getLogger(__name__)

def diagnostico_cnpj(cnpj: str, captcha_resposta: str = None) -> dict:
    """
    Consulta dados reais do CNPJ usando a API pública ReceitaWS.
    """

    # Validação do CNPJ
    if not cnpj or len(cnpj) != 14 or not cnpj.isdigit():
        logger.error("CNPJ inválido recebido")
        return {
            "erro": "CNPJ inválido. Informe apenas números, total de 14 dígitos.",
            "responsavel": None,
            "status": None,
            "situacao_enquadramento": None,
            "declaracao_anual": None,
            "divida_ativa": None,
            "demais_debitos": None,
            "valor_regularizacao": None
        }

    logger.info(f"Consultando dados reais para CNPJ: {cnpj}")

    try:
        # Requisição à API ReceitaWS
        url = f"https://receitaws.com.br/v1/cnpj/{cnpj}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "ConsultaCNPJBot/1.0"
        }
        resp = requests.get(url, headers=headers, timeout=15)
        dados = resp.json()

        # Se a API retornar erro
        if dados.get("status") == "ERROR":
            return {
                "erro": dados.get("message", "Erro ao consultar CNPJ."),
                "responsavel": None,
                "status": None,
                "situacao_enquadramento": None,
                "declaracao_anual": None,
                "divida_ativa": None,
                "demais_debitos": None,
                "valor_regularizacao": None
            }

        # Nome do responsável / empresa
        responsavel = (dados.get("nome") or dados.get("fantasia") or "Empreendedor(a)").strip()

        # Situação cadastral
        situacao_rf = dados.get("situacao", "").strip().lower()
        mapa_status = {
            "ativa": "ativo",
            "atual": "ativo",
            "baixada": "baixado",
            "baixado": "baixado",
            "inapta": "inapto",
            "suspensa": "inapto"
        }
        status = mapa_status.get(situacao_rf, "inapto")

        # Monta resposta para o frontend
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
        return {
            "erro": f"Erro ao consultar CNPJ: {str(e)}",
            "responsavel": None,
            "status": None,
            "situacao_enquadramento": None,
            "declaracao_anual": None,
            "divida_ativa": None,
            "demais_debitos": None,
            "valor_regularizacao": None
        }
