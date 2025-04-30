from flask import Flask, render_template, request
from consulta import diagnostico_cnpj
from registro import registrar_cnpj

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/consultar', methods=['POST'])
def consultar():
    data = request.get_json()
    return diagnostico_cnpj(data)

@app.route('/registro', methods=['POST'])
def registro():
    return registrar_cnpj(request)

if __name__ == '__main__':
    app.run(debug=True)
