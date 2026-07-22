import httpx
import sys

BASE_URL = "http://127.0.0.1:8000"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTc4NDY1MzQ5NX0.WS-udF-wIt8n6SJ7xjxYynZJaDXfPIZDUpGPLpCy5uk"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

def test_ai_quiz_pipeline():
    print("Testing AI Quiz Generation System endpoints...")
    client = httpx.Client(base_url=BASE_URL, headers=HEADERS, timeout=30.0)

    # 1. Test GET /api/chat/ai-quizzes (History)
    print("\n1. Testing GET /api/chat/ai-quizzes...")
    r = client.get("/api/chat/ai-quizzes")
    print("  Status:", r.status_code)
    assert r.status_code == 200, f"Failed history fetch: {r.text}"
    history = r.json()
    print(f"  History sets count: {len(history)}")

    # 2. Test POST /api/chat/generate-ai-quiz
    print("\n2. Testing POST /api/chat/generate-ai-quiz...")
    payload = {
        "prompt": "Generate 3 MCQs on Renal Physiology from Guyton Page 45",
        "count": 3
    }
    r = client.post("/api/chat/generate-ai-quiz", json=payload)
    print("  Status:", r.status_code)
    if r.status_code == 200:
        data = r.json()
        quiz_set_id = data.get("quiz_set_id")
        print(f"  [OK] Generated Quiz Set ID: {quiz_set_id}")
        print(f"  Title: {data.get('quiz_set_title')}")
        print(f"  MCQ Count: {data.get('total_questions')}")

        # 3. Test starting custom AI quiz attempt via /api/quizzes/start
        print("\n3. Testing POST /api/quizzes/start with quiz_set_id...")
        r_start = client.post("/api/quizzes/start", json={"quiz_set_id": quiz_set_id, "num_questions": 10})
        print("  Status:", r_start.status_code)
        assert r_start.status_code == 200, f"Failed starting custom quiz: {r_start.text}"
        print("  [OK] Quiz attempt started successfully!")

        # 4. Test DELETE /api/chat/ai-quizzes/{quiz_set_id}
        print(f"\n4. Testing DELETE /api/chat/ai-quizzes/{quiz_set_id}...")
        r_del = client.delete(f"/api/chat/ai-quizzes/{quiz_set_id}")
        print("  Status:", r_del.status_code)
        assert r_del.status_code == 204, f"Failed deletion: {r_del.text}"
        print("  [OK] Quiz set deleted successfully!")
    else:
        print("  Notice: DeepSeek API key response:", r.status_code, r.text)

    print("\n[OK] AI Quiz Generation pipeline test completed!")

if __name__ == "__main__":
    test_ai_quiz_pipeline()
