import logging
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.common.exceptions import NoSuchElementException, TimeoutException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager

logger = logging.getLogger(__name__)

def diagnostico_cnpj(cnpj: str, captcha_resposta: str = None) -> dict:
    """
    Realiza o diagnóstico básico do CNPJ consultando o site da Receita Federal.

    Retorna:
        - {"captcha": <base64>} se for necessário o usuário resolver captcha.
        - {"status": "ativo" | "baixado" | "inapto" | "captcha_incorreto" | "erro"} se a consulta for concluída.
    """
    if not cnpj:
        logger.error("Nenhum CNPJ recebido na função diagnostico_cnpj")
        return {"erro": "CNPJ ausente na requisição."}

    # Configurações do Chrome para rodar em ambiente serverless (como Vercel)
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920x1080")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-software-rasterizer")
    options.add_argument("--disable-features=VizDisplayCompositor")
    options.add_argument("--single-process")

    driver = None

    try:
        logger.info(f"Iniciando consulta para CNPJ: {cnpj}")

        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options
        )
        driver.set_page_load_timeout(20)

        # Acessa o site da Receita
        logger.info("Acessando site da Receita Federal...")
        driver.get("https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp")

        # Preenche CNPJ
        try:
            input_cnpj = driver.find_element(By.NAME, "cnpj")
            input_cnpj.clear()
            input_cnpj.send_keys(cnpj)
        except NoSuchElementException:
            logger.error("Campo de CNPJ não encontrado na página.")
            return {"erro": "Página da Receita indisponível ou layout alterado."}

        # Captura captcha
        try:
            captcha_element = driver.find_element(By.ID, "imgCaptcha")
            captcha_base64 = captcha_element.screenshot_as_base64
        except NoSuchElementException:
            logger.error("Elemento de captcha não encontrado.")
            return {"erro": "Captcha não encontrado na página."}

        # Se não houver resposta do captcha, retorna imagem para o frontend
        if not captcha_resposta:
            logger.info("Captcha retornado para resolução do usuário.")
            return {"captcha": captcha_base64}

        # Preenche captcha e envia formulário
        logger.info("Enviando resposta do captcha...")
        try:
            input_captcha = driver.find_element(By.NAME, "txtTexto_captcha_serpro_gov_br")
            input_captcha.clear()
            input_captcha.send_keys(captcha_resposta)
            driver.find_element(By.NAME, "submit1").click()
        except NoSuchElementException:
            logger.error("Campo ou botão de envio do captcha não encontrado.")
            return {"erro": "Não foi possível enviar o captcha."}

        time.sleep(2)  # aguarda resposta da Receita

        html = driver.page_source.upper()

        # Analisa resultado
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
            logger.warning("Status não identificado no HTML retornado.")
            status = "erro"

        logger.info(f"Diagnóstico obtido: {status}")
        return {"status": status}

    except TimeoutException:
        logger.error("Tempo limite excedido ao acessar o site da Receita.")
        return {"erro": "Tempo limite excedido para acessar a Receita Federal."}
    except WebDriverException as e:
        logger.error(f"Erro no WebDriver: {str(e)}")
        return {"erro": f"Erro no navegador: {str(e)}"}
    except Exception as e:
        logger.error(f"Erro inesperado: {str(e)}")
        return {"erro": f"Erro interno: {str(e)}"}

    finally:
        if driver:
            try:
                driver.quit()
                logger.info("ChromeDriver encerrado com sucesso.")
            except Exception as e:
                logger.warning(f"Falha ao encerrar ChromeDriver: {str(e)}")
