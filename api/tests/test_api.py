from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_lookup_existing_word():
    client.post("/words", json={"word": "звонит", "stressed": "звони́т", "source": "test"})
    response = client.get("/stress", params={"word": "звонит"})
    assert response.status_code == 200
    data = response.json()
    assert data["found"] is True
    assert data["stressed"] == "звони́т"
