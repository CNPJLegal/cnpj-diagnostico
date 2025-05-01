# consulta.py
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time
import base64
from io import BytesIO
from PIL import Image

def buscar_situacao_cadastral(cnpj, captcha_resposta=None, session=None):
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')

    driver = webdriver.Chrome(options=options)

    try:
        # Acessar página da Receita
        driver.get("https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp")

        # Preencher CNPJ
        driver.find_element(By.NAME, "cnpj").send_keys(cnpj)

        # Captura imagem do CAPTCHA
        captcha_img = driver.find_element(By.ID, "imgCaptcha")
        captcha_base64 = captcha_img.screenshot_as_base64

        if not captcha_resposta:
            # Encerrar sessão e retornar CAPTCHA para interface
            driver.quit()
            return { "captcha": captcha_base64 }

        # Preencher o CAPTCHA e enviar
        driver.find_element(By.NAME, "txtTexto_captcha_serpro_gov_br").send_keys(captcha_resposta)
        driver.find_element(By.NAME, "submit1").click()
        time.sleep(2)

        html = driver.page_source

        # Verificar status
        if "CNPJ BAIXADO" in html:
            status = "baixado"
        elif "CNPJ INAPTO" in html:
            status = "inapto"
        elif "CNPJ ATIVO" in html:
            status = "ativo"
        else:
            status = "erro"

        driver.quit()

        return { "status": status }

    except Exception as e:
        driver.quit()
        return { "erro": str(e) }
