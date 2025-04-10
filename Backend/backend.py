import os
import io
import numpy as np
from PIL import Image
import tensorflow as tf
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2          # For video processing
import traceback    # For detailed error logging
import mimetypes    # To determine file type
import tempfile     # For handling temporary video files
import argparse     # For command-line arguments (port)

# --- Configuration ---
# Shared Config
# Threshold for determining deepfake based on model score (0.0 to 1.0)
# If score > threshold, considered deepfake. Adjust based on model performance.
PREDICTION_THRESHOLD = 0.9 # Using the threshold from your image-only script

# Image Model Config
# !!! UPDATE FILENAMES IF NEEDED !!!
IMAGE_MODEL_FILENAME = "deepfake_model.keras" # Or .keras - match your file
IMAGE_MODEL_PATH = os.path.join(os.path.dirname(__file__), IMAGE_MODEL_FILENAME)
IMAGE_HEIGHT = 224
IMAGE_WIDTH = 224
IMAGE_EXPECTED_CHANNELS = 3

# Video Model Config
# !!! UPDATE FILENAMES IF NEEDED !!!
VIDEO_MODEL_FILENAME = "deepfake-detection-model1.h5" # Match your file
VIDEO_MODEL_PATH = os.path.join(os.path.dirname(__file__), VIDEO_MODEL_FILENAME)
VIDEO_FRAME_HEIGHT = 224
VIDEO_FRAME_WIDTH = 224
VIDEO_EXPECTED_CHANNELS = 3
# How often to sample frames (e.g., 15 means process every 15th frame)
VIDEO_FRAME_SAMPLE_RATE = 15

# --- Initialize Flask App ---
app = Flask(__name__)
CORS(app) # Enable CORS

# --- Load Models ---
image_model = None
video_model = None
model_load_error = [] # Store errors for both models

# Load Image Model
print("--- Loading Image Model ---")
if os.path.exists(IMAGE_MODEL_PATH):
    try:
        print(f"Attempting to load Image model from: {IMAGE_MODEL_PATH}")
        image_model = tf.keras.models.load_model(IMAGE_MODEL_PATH)
        print(f"Image Model ({IMAGE_MODEL_FILENAME}) loaded successfully.")
    except Exception as e:
        err_msg = f"Error loading Keras Image model ({IMAGE_MODEL_FILENAME}): {e}"
        model_load_error.append(err_msg)
        print(f"ERROR: {err_msg}")
else:
    err_msg = f"Image Model file not found at {IMAGE_MODEL_PATH}"
    model_load_error.append(err_msg)
    print(f"ERROR: {err_msg}")

# Load Video Model
print("--- Loading Video Model ---")
if os.path.exists(VIDEO_MODEL_PATH):
    try:
        print(f"Attempting to load Video model from: {VIDEO_MODEL_PATH}")
        # Use compile=False if inference only, adjust if needed
        video_model = tf.keras.models.load_model(VIDEO_MODEL_PATH, compile=False)
        print(f"Video Model ({VIDEO_MODEL_FILENAME}) loaded successfully.")
    except Exception as e:
        err_msg = f"Error loading Keras Video model ({VIDEO_MODEL_FILENAME}): {e}"
        model_load_error.append(err_msg)
        print(f"ERROR: {err_msg}")
else:
    err_msg = f"Video Model file not found at {VIDEO_MODEL_PATH}"
    model_load_error.append(err_msg)
    print(f"ERROR: {err_msg}")

print("--- Model Loading Complete ---")
if model_load_error:
    print("Model Loading Errors Encountered:")
    for error in model_load_error:
        print(f"- {error}")
if image_model is None and video_model is None:
    print("CRITICAL ERROR: No models could be loaded. The application might not function.")
print("----------------------------")


# --- Image Preprocessing ---
def preprocess_image(image_bytes):
    """Preprocesses image bytes for the image model."""
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        img = img.resize((IMAGE_WIDTH, IMAGE_HEIGHT))
        img_array = tf.keras.preprocessing.image.img_to_array(img)

        if img_array.shape[-1] != IMAGE_EXPECTED_CHANNELS:
           print(f"Warning: Image has {img_array.shape[-1]} channels, expected {IMAGE_EXPECTED_CHANNELS}.")

        img_array = np.expand_dims(img_array, axis=0)
        # Ensure normalization matches image model training (e.g., / 255.0)
        img_array = img_array / 255.0
        return img_array
    except Exception as e:
        print(f"Error preprocessing image: {e}")
        raise ValueError(f"Error preprocessing image: {e}")

# --- Video Frame Preprocessing ---
def preprocess_video_frame(frame_np):
    """Preprocesses a single video frame (NumPy array from cv2) for the VIDEO model."""
    try:
        img_rgb = cv2.cvtColor(frame_np, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img_rgb, (VIDEO_FRAME_WIDTH, VIDEO_FRAME_HEIGHT))
        img_array = np.array(img_resized, dtype=np.float32)

        if img_array.shape[-1] != VIDEO_EXPECTED_CHANNELS:
           print(f"Warning: Frame has {img_array.shape[-1]} channels, expected {VIDEO_EXPECTED_CHANNELS}.")

        img_batch = np.expand_dims(img_array, axis=0)
        # Ensure normalization matches video model training (e.g., / 255.0)
        img_normalized = img_batch / 255.0
        return img_normalized
    except Exception as e:
        print(f"Error preprocessing frame: {e}")
        return None # Indicate failure for this frame

# --- Video Processing Function ---
def analyze_video(video_bytes):
    """Analyzes a video by processing sampled frames. Returns the average prediction score."""
    if video_model is None:
        raise ValueError("Video model is not loaded.")

    temp_file = None
    video_path = None
    try:
        # Use NamedTemporaryFile for safer handling
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") # Suffix helps some OS/libs
        video_path = temp_file.name
        temp_file.write(video_bytes)
        temp_file.close() # Close handle so cv2 can open it
        print(f"Video saved temporarily to: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open temporary video file: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        print(f"Video has {total_frames} frames.")
        if total_frames == 0: raise ValueError("Video file contains no frames.")

        frame_predictions = []
        frames_processed_for_prediction = 0

        while True:
            ret, frame = cap.read()
            if not ret: break # End of video

            current_frame_index = int(cap.get(cv2.CAP_PROP_POS_FRAMES))

            # Process every Nth frame
            if current_frame_index % VIDEO_FRAME_SAMPLE_RATE == 0:
                processed_frame = preprocess_video_frame(frame)
                if processed_frame is not None:
                    try:
                        # Predict using the loaded VIDEO model
                        prediction = video_model.predict(processed_frame)
                        # Assuming model output is [[score]] where score is deepfake likelihood
                        score = float(prediction[0][0])
                        frame_predictions.append(score)
                        frames_processed_for_prediction += 1
                    except Exception as pred_e:
                        print(f"Warning: Error predicting frame {current_frame_index}: {pred_e}")
                else:
                     print(f"Warning: Skipping frame {current_frame_index} due to preprocessing error.")

        cap.release()
        print(f"Finished processing video. Analyzed {frames_processed_for_prediction} frames.")

        if not frame_predictions:
            raise ValueError("No frames were successfully processed for prediction.")

        # Calculate the average score from the analyzed frames
        average_score = np.mean(frame_predictions)
        return average_score

    except Exception as e:
        print(f"Error during video analysis: {e}")
        traceback.print_exc()
        # Re-raise as ValueError to be caught by the endpoint
        raise ValueError(f"Video processing failed: {e}")
    finally:
        # Ensure the temporary file is deleted
        if video_path and os.path.exists(video_path):
            try: os.unlink(video_path); print(f"Temporary file deleted: {video_path}")
            except Exception as del_e: print(f"Error deleting temp file {video_path}: {del_e}")
        elif temp_file and os.path.exists(temp_file.name): # Fallback if path wasn't assigned
             try: os.unlink(temp_file.name); print(f"Temporary file deleted: {temp_file.name}")
             except Exception as del_e: print(f"Error cleaning temp file object {temp_file.name}: {del_e}")


# --- API Endpoint ---
@app.route('/predict', methods=['POST'])
def predict():
    """
    API endpoint for image/video deepfake prediction.
    Expects file in request under key 'file'.
    Returns {"is_deepfake": bool, "confidence": float (0.0-1.0)}.
    """
    # Check if any models loaded
    if image_model is None and video_model is None:
         combined_errors = ". ".join(model_load_error) if model_load_error else "Models not loaded."
         return jsonify({"error": f"No models available for prediction. Load errors: {combined_errors}"}), 500

    # --- Use 'file' as the key, consistent with video example & frontend update ---
    if 'file' not in request.files:
        return jsonify({"error": "No file found in request (expected key 'file')"}), 400

    file = request.files['file'] # Use 'file' key

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        file_bytes = file.read()
        # Try to determine file type using MIME type
        mime_type = file.mimetype
        print(f"Received file: {file.filename}, MIME type: {mime_type}")

        final_score = None # This will hold the deepfake likelihood score (0.0 to 1.0)
        model_used = None # Keep track of which model path was used

        # --- Routing based on MIME type ---
        if mime_type and mime_type.startswith('image/'):
            if image_model is None: return jsonify({"error": f"Image model unavailable. Errors: {model_load_error}"}), 500
            print("Processing as Image...")
            processed_input = preprocess_image(file_bytes)
            prediction = image_model.predict(processed_input)
            final_score = prediction[0][0] # Get the raw score
            model_used = "image"

        elif mime_type and mime_type.startswith('video/'):
            if video_model is None: return jsonify({"error": f"Video model unavailable. Errors: {model_load_error}"}), 500
            print("Processing as Video...")
            # analyze_video handles frame processing and returns the average score
            final_score = analyze_video(file_bytes)
            model_used = "video"
        else:
             # Fallback: Try guessing type from filename if MIME type is generic/missing
             guessed_type, _ = mimetypes.guess_type(file.filename)
             print(f"MIME type '{mime_type}' unclear or missing, guessed type: {guessed_type}")
             if guessed_type and guessed_type.startswith('image/'):
                 if image_model is None: return jsonify({"error": f"Image model unavailable (guessed). Errors: {model_load_error}"}), 500
                 print("Processing as Image (guessed)...")
                 processed_input = preprocess_image(file_bytes)
                 prediction = image_model.predict(processed_input)
                 final_score = prediction[0][0]
                 model_used = "image"
             elif guessed_type and guessed_type.startswith('video/'):
                 if video_model is None: return jsonify({"error": f"Video model unavailable (guessed). Errors: {model_load_error}"}), 500
                 print("Processing as Video (guessed)...")
                 final_score = analyze_video(file_bytes)
                 model_used = "video"
             else:
                # If type cannot be determined, return an error
                return jsonify({"error": f"Unsupported file type: '{mime_type or guessed_type or 'Unknown'}'."}), 400

        # --- Interpret Final Score & Format Response ---

        # Ensure final_score is a standard Python float for calculations and JSON
        final_score_py = float(final_score)

        # Determine if deepfake based on threshold
        is_deepfake_np = final_score_py >= PREDICTION_THRESHOLD
        is_deepfake_py = bool(is_deepfake_np) # Convert to Python bool for JSON

        # Calculate confidence for the *predicted* class (0.0 to 1.0)
        # If predicted deepfake (score >= threshold), confidence is the score itself.
        # If predicted real (score < threshold), confidence is (1 - score).
        confidence_float = final_score_py if is_deepfake_py else (1.0 - final_score_py)

        print(f"Processing complete. Model: {model_used}, Score: {final_score_py:.4f}, IsDeepfake: {is_deepfake_py}, Confidence: {confidence_float:.4f}")

        # Return the specific JSON format required by your frontend's consensus logic
        return jsonify({
            "is_deepfake": is_deepfake_py,      # Return boolean
            "confidence": confidence_float      # Return float (0.0-1.0 range approx)
        })

    except ValueError as ve: # Catch specific processing/value errors
         print(f"Processing Error: {ve}")
         return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print(f"Unhandled Prediction Error: {e}")
        traceback.print_exc()
        # Generic error for the client in production
        return jsonify({"error": "An unexpected error occurred during processing."}), 500

# --- Run the App ---
if __name__ == '__main__':
    # Setup command-line argument parsing for the port
    parser = argparse.ArgumentParser(description='Run Deepfake Detection Flask Server Node.')
    parser.add_argument('--port', type=int, default=5001, help='Port to run the server on')
    # Optional: Add host argument if needed:
    # parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind the server to')
    args = parser.parse_args()

    print(f"Flask app starting on host 0.0.0.0, port {args.port}...")
    # Run with debug=False for production/multiple nodes
    # Use threaded=True if your model prediction is thread-safe and might benefit
    app.run(host='0.0.0.0', port=args.port, debug=False, threaded=False)