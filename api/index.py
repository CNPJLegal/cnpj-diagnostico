# api/index.py
from flask import Flask, render_template, request, jsonify, send_from_directory
from consulta import diagnostico_cnpj
from registro import registrar_cnpj
import os
import logging

# Configuração do logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ajuste dos paths para rodar dentro da pasta /api
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "../static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "../templates")

app = Flask(__name__, static_folder=STATIC_DIR, template_folder=TEMPLATES_DIR)

@app.route('/')
def index():
    return render_template('index.html')

# Rota para servir arquivos estáticos (CSS, imagens, favicon, etc.)
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory(app.static_folder, filename)

# Rota para servir favicon.ico
@app.route('/favicon.ico')
def favicon_ico():
    try:
        return send_from_directory(app.static_folder, 'favicon.ico', mimetype='image/vnd.microsoft.icon')
    except FileNotFoundError:
        logger.warning("favicon.ico não encontrado, retornando vazio.")
        return '', 204

# Rota para servir favicon.png (evita erro 500 caso não exista)
@app.route('/favicon.png')
def favicon_png():
    try:
        return send_from_directory(app.static_folder, 'favicon.png', mimetype='image/png')
    except FileNotFoundError:
        logger.warning("favicon.png não encontrado, retornando vazio.")
        return '', 204

@app.route('/consultar', methods=['POST'])
def consultar():
    try:
        data = request.get_json(force=True)
        cnpj = data.get('cnpj', '').strip()
        captcha_resposta = data.get('captcha', '').strip() if data.get('captcha') else None

        # Validação básica do CNPJ
        if not cnpj or len(cnpj) != 14 or not cnpj.isdigit():
            logger.warning(f"CNPJ inválido recebido: {cnpj}")
            return jsonify({'erro': 'CNPJ inválido. Informe apenas números, total de 14 dígitos.'}), 400

        logger.info(f"Consulta iniciada para CNPJ: {cnpj}")

        # Chama função de diagnóstico
        resultado = diagnostico_cnpj(cnpj, captcha_resposta)

        return jsonify(resultado)

    except Exception as e:
        logger.exception("Erro na rota /consultar")
        return jsonify({'erro': 'Erro interno no servidor', 'detalhes': str(e)}), 500

@app.route('/registro', methods=['POST'])
def registro():
    try:
        return registrar_cnpj(request)
    except Exception as e:
        logger.exception("Erro na rota /registro")
        return jsonify({'erro': 'Erro ao registrar CNPJ', 'detalhes': str(e)}), 500

# Compatibilidade com Vercel
def handler(environ, start_response):
    return app.wsgi_app(environ, start_response)

# Execução local (para testes fora da Vercel)
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug_mode = os.environ.get("FLASK_DEBUG", "False").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
