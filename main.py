# main.py
from flask import Flask, render_template, request, jsonify, send_from_directory
from consulta import diagnostico_cnpj
from registro import registrar_cnpj
import os
import logging

# Configuração do logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static", template_folder="templates")

@app.route('/')
def index():
    return render_template('index.html')

# Rota para servir favicon
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/consultar', methods=['POST'])
def consultar():
    try:
        data = request.get_json(force=True)
        cnpj = data.get('cnpj', '').strip()
        captcha_resposta = data.get('captcha', '').strip() if data.get('captcha') else None

        # Validação básica do CNPJ
        if not cnpj or len(cnpj) != 14 or not cnpj.isdigit():
            return jsonify({'erro': 'CNPJ inválido. Informe apenas números, total de 14 dígitos.'}), 400

        logger.info(f"Consulta iniciada para CNPJ: {cnpj}")

        # Chama função de scraping/diagnóstico
        resultado = diagnostico_cnpj(cnpj, captcha_resposta)

        return jsonify(resultado)

    except Exception as e:
        logger.error(f"Erro na rota /consultar: {str(e)}")
        return jsonify({'erro': 'Erro interno no servidor', 'detalhes': str(e)}), 500

@app.route('/registro', methods=['POST'])
def registro():
    try:
        return registrar_cnpj(request)
    except Exception as e:
        logger.error(f"Erro na rota /registro: {str(e)}")
        return jsonify({'erro': 'Erro ao registrar CNPJ', 'detalhes': str(e)}), 500

# Para rodar localmente ou na Vercel
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    debug_mode = os.environ.get("FLASK_DEBUG", "False").lower() == "true"
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
