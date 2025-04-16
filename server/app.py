from flask import Flask, request, jsonify
from flask import render_template
from flask_cors import CORS
from flask_socketio import SocketIO
from geopy.geocoders import Nominatim

app = Flask(__name__)
# enable access to endpoint for the javascript
CORS(app)  
socketio = SocketIO(app, cors_allowed_origins="*")

received_data = []
geolocator = Nominatim(user_agent="web_traffic")


@app.route('/')
def home():
    return render_template('index.html')

# receive the data from sender: POST
@app.route('/api/package', methods=['POST'])
def receive_data():
    data = request.get_json()
    received_data.append(data)
    if not data:
        return jsonify({'error': 'No data'}), 400
    print(f"Received data: {data}")
    socketio.emit('new_package', data)
    return jsonify({'status': 'success', 'data': data}), 200

# get the data from sender: GET
@app.route('/api/package', methods=['GET'])
def get_data():
    return jsonify(received_data), 200

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5555, host='0.0.0.0', allow_unsafe_werkzeug=True)