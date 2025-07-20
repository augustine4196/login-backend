from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import os

app = Flask(__name__)
CORS(app)

# MongoDB setup (replace with your own Mongo URI if needed)
client = MongoClient("mongodb+srv://fitflow_user:tiku1234@cluster0.gpsjooy.mongodb.net/fitflowdb?retryWrites=true&w=majority")
db = client['fitflow']
collection = db['users']

@app.route('/upload', methods=['POST'])
def upload_image():
    data = request.get_json()
    name = data.get('name')
    image_url = data.get('imageUrl')

    if not name or not image_url:
        return jsonify({'error': 'Missing name or imageUrl'}), 400

    # Save or update the record
    collection.update_one(
        {'name': name},
        {'$set': {'imageUrl': image_url}},
        upsert=True
    )

    return jsonify({'message': 'Image URL saved successfully'}), 200

@app.route('/')
def home():
    return "FitFlow backend is running!"

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
