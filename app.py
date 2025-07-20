from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import os

app = Flask(__name__)
CORS(app)

# MongoDB Atlas setup
MONGO_URI = 'mongodb+srv://fitflow_user:tiku1234@cluster0.gpsjooy.mongodb.net/fitflowdb?retryWrites=true&w=majority'  # Replace with your MongoDB URI
client = MongoClient(MONGO_URI)
db = client['fitness_db']
collection = db['user_profiles']

@app.route('/upload', methods=['POST'])
def upload_profile_picture():
    data = request.json
    name = data.get('name')
    image_url = data.get('imageUrl')

    if not name or not image_url:
        return jsonify({'error': 'Missing name or imageUrl'}), 400

    # Save or update user image
    collection.update_one(
        {'name': name},
        {'$set': {'imageUrl': image_url}},
        upsert=True
    )

    return jsonify({'message': 'Image URL saved to database ✅'}), 200

@app.route('/')
def index():
    return 'FitFlow Backend is running!'

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
