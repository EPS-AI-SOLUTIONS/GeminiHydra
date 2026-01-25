import json
import sys
import math

# Cosine similarity in pure Python
def cosine_similarity(v1, v2):
    dot_product = sum(a*b for a,b in zip(v1, v2))
    magnitude1 = math.sqrt(sum(a*a for a in v1))
    magnitude2 = math.sqrt(sum(b*b for b in v2))
    if not magnitude1 or not magnitude2:
        return 0.0
    return dot_product / (magnitude1 * magnitude2)

def main():
    try:
        # Args: [1] query_vector_json, [2] memory_file_path, [3] top_k
        query_vector = json.loads(sys.argv[1])
        memory_file = sys.argv[2]
        top_k = int(sys.argv[3])

        with open(memory_file, 'r', encoding='utf-8') as f:
            memories = json.load(f)

        results = []
        for mem in memories:
            # Check if embedding exists
            if 'embedding' not in mem or not mem['embedding']:
                continue
                
            score = cosine_similarity(query_vector, mem['embedding'])
            results.append({
                'content': mem['content'],
                'score': score,
                'metadata': mem.get('metadata', {}),
                'id': mem.get('id', 'unknown')
            })

        # Sort by score descending
        results.sort(key=lambda x: x['score'], reverse=True)
        
        # Output JSON result
        print(json.dumps(results[:top_k]))

    except Exception as e:
        # Fallback error
        print(json.dumps([{"error": str(e)}]))

if __name__ == "__main__":
    main()
