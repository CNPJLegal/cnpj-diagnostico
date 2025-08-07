# consulta.py

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import base64
import time
import logging

logger = logging.getLogger(__name__)

def diagnostico_cnpj(cnpj: str, captcha_resposta: str = None) -> dict:
    """
    Realiza o diagnóstico básico do CNPJ consultando o site da Receita Federal.
    Retorna:
        - {"captcha": <base64>} se for necessário o usuário resolver captcha
        - {"status": "ativo" | "baixado" | "inapto" | "captcha_incorreto" | "erro"}
    """
    if not cnpj:
        logger.error("Nenhum CNPJ recebido na função diagnostico_cnpj")
        return {"erro": "CNPJ ausente na requisição."}

    options = Options()
    options.add_argument("--headless")  
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920x1080")

    driver = None

    try:
        logger.info(f"Iniciando consulta para CNPJ: {cnpj}")
        driver = webdriver.Chrome(options=options)

        logger.info("Acessando site da Receita Federal...")
        driver.get("https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp")

        logger.info("Preenchendo CNPJ no formulário...")
        input_cnpj = driver.find_element(By.NAME, "cnpj")
        input_cnpj.clear()
        input_cnpj.send_keys(cnpj)

        # Captura captcha
        captcha_element = driver.find_element(By.ID, "imgCaptcha")
        captcha_base64 = captcha_element.screenshot_as_base64

        # Se não houver resposta de captcha, retorna para o frontend
        if not captcha_resposta:
            logger.info("Retornando captcha para o usuário resolver.")
            return {"captcha": captcha_base64}

        # Preenche o captcha e envia
        logger.info("Enviando resposta do captcha...")
        input_captcha = driver.find_element(By.NAME, "txtTexto_captcha_serpro_gov_br")
        input_captcha.clear()
        input_captcha.send_keys(captcha_resposta)
        driver.find_element(By.NAME, "submit1").click()

        time.sleep(2)  # Aguardar processamento

        html = driver.page_source.upper()

        logger.info("Analisando retorno da Receita...")
        if "CNPJ BAIXADO" in html:
            status = "baixado"
        elif "CNPJ INAPTO" in html:
            status = "inapto"
        elif "CNPJ ATIVO" in html:
            status = "ativo"
        elif "DIGITADO NÃO CONFERE" in html or "CÓDIGO DA IMAGEM" in html:
            status = "captcha_incorreto"
        else:
            status = "erro"

        logger.info(f"Diagnóstico obtido: {status}")
        return {"status": status}

    except Exception as e:
        logger.error(f"Erro durante a consulta: {str(e)}")
        return {"erro": f"Erro interno: {str(e)}"}

    finally:
        if driver:
            try:
                driver.quit()
                logger.info("ChromeDriver encerrado com sucesso.")
            except Exception as e:
                logger.warning(f"Falha ao encerrar ChromeDriver: {str(e)}")
