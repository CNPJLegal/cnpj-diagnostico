# consulta.py

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import base64
import time

def diagnostico_cnpj(data):
    print(f"[LOG] Consulta recebida: {data}")

    cnpj = data.get("cnpj")
    captcha_resposta = data.get("captcha_resposta")

    options = Options()
    options.add_argument("--headless")  # roda sem abrir janela
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    try:
        print("[LOG] Iniciando ChromeDriver...")
        driver = webdriver.Chrome(options=options)

        print("[LOG] Acessando site da Receita...")
        driver.get("https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp")

        print("[LOG] Preenchendo CNPJ no formulário...")
        input_cnpj = driver.find_element(By.NAME, "cnpj")
        input_cnpj.send_keys(cnpj)

        print("[LOG] Capturando imagem do CAPTCHA...")
        captcha_element = driver.find_element(By.ID, "imgCaptcha")
        captcha_base64 = captcha_element.screenshot_as_base64

        if not captcha_resposta:
            print("[LOG] Nenhum CAPTCHA recebido ainda. Retornando imagem.")
            driver.quit()
            return { "captcha": captcha_base64 }

        print("[LOG] Preenchendo e enviando CAPTCHA...")
        input_captcha = driver.find_element(By.NAME, "txtTexto_captcha_serpro_gov_br")
        input_captcha.send_keys(captcha_resposta)
        driver.find_element(By.NAME, "submit1").click()

        time.sleep(2)
        html = driver.page_source
        html_upper = html.upper()

        print("[LOG] Analisando retorno da Receita...")
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

        print(f"[LOG] Diagnóstico final: {status}")
        return { "status": status }

    except Exception as e:
        print(f"[ERRO] Falha no diagnóstico: {str(e)}")
        return { "erro": f"Erro interno: {str(e)}" }

    finally:
        print("[LOG] Finalizando e fechando navegador.")
        try:
            driver.quit()
        except:
            pass
