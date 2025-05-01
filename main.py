# main.py

from flask import Flask, render_template, request, jsonify
from consulta import diagnostico_cnpj
from registro import registrar_cnpj
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/consultar', methods=['POST'])
def consultar():
    try:
        data = request.get_json()
        cnpj = data.get('cnpj')
        captcha_resposta = data.get('captcha')

        # Chama a função que faz o scraping e retorna a situação
        resultado = diagnostico_cnpj(cnpj, captcha_resposta)

        return jsonify(resultado)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

@app.route('/registro', methods=['POST'])
def registro():
    return registrar_cnpj(request)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
