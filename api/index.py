# api/index.py
from flask import Flask, render_template, request, jsonify, send_from_directory
from consulta import diagnostico_cnpj
from registro import registrar_cnpj
import os

app = Flask(__name__, static_folder="../static", template_folder="../templates")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/consultar', methods=['POST'])
def consultar():
    data = request.get_json(force=True)
    cnpj = data.get('cnpj', '').strip()
    captcha_resposta = data.get('captcha', '').strip() if data.get('captcha') else None

    if not cnpj or len(cnpj) != 14 or not cnpj.isdigit():
        return jsonify({'erro': 'CNPJ inválido'}), 400

    resultado = diagnostico_cnpj(cnpj, captcha_resposta)
    return jsonify(resultado)

@app.route('/registro', methods=['POST'])
def registro():
    return registrar_cnpj(request)

# Exporta para Vercel
def handler(request, *args, **kwargs):
    return app(request.environ, start_response=kwargs.get("start_response"))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
