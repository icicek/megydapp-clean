export async function saveTokenToList(
    mintAddress: string,
    listType: 'lowLiquidity' | 'lowVolume'
  ) {
    try {
      const response = await fetch(`/api/tokens/add-to-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintAddress, listType }),
      });
  
      if (!response.ok) {
        throw new Error(`Failed to add token to ${listType} list`);
      }
  
      console.log(`Token ${mintAddress} başarıyla ${listType} listesine eklendi`);
    } catch (err) {
      console.error(`Liste ekleme hatası:`, err);
    }
  }
  