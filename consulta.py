# consulta.py

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import base64
import time

def diagnostico_cnpj(cnpj, captcha_resposta=None):
    options = Options()
    options.add_argument("--headless")  # roda sem abrir janela
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    # Inicializa o ChromeDriver
    driver = webdriver.Chrome(options=options)

    try:
        # Vai para a página da Receita
        driver.get("https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp")

        # Preenche o campo do CNPJ
        input_cnpj = driver.find_element(By.NAME, "cnpj")
        input_cnpj.send_keys(cnpj)

        # Captura o CAPTCHA
        captcha_element = driver.find_element(By.ID, "imgCaptcha")
        captcha_base64 = captcha_element.screenshot_as_base64

        # Se ainda não tem a resposta do CAPTCHA, retorna a imagem
        if not captcha_resposta:
            return { "captcha": captcha_base64 }

        # Preenche o CAPTCHA e envia
        input_captcha = driver.find_element(By.NAME, "txtTexto_captcha_serpro_gov_br")
        input_captcha.send_keys(captcha_resposta)

        # Clica no botão de envio
        driver.find_element(By.NAME, "submit1").click()
        time.sleep(2)

        # Captura o HTML da resposta
        html = driver.page_source

        # Diagnóstico básico por palavras-chave
        html_upper = html.upper()  # padroniza pra comparar

        if "CNPJ BAIXADO" in html_upper:
            status = "baixado"
        elif "CNPJ INAPTO" in html_upper:
            status = "inapto"
        elif "CNPJ ATIVO" in html_upper:
            status = "ativo"
        elif "DIGITADO NÃO CONFERE" in html_upper or "CÓDIGO DA IMAGEM" in html_upper:
            status = "captcha_incorreto"
        else:
            status = "erro"

        return { "status": status }

    except Exception as e:
        return { "erro": f"Erro interno: {str(e)}" }

    finally:
        driver.quit()
