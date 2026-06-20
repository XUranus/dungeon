"""文本处理工具: 切分文本为语义chunk"""


def split_text_to_chunks(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 80,
) -> list[str]:
    """将文本按段落/句子切分为chunk

    优先按段落切分, 段落过长则按句子切分。
    相邻 chunk 之间有 chunk_overlap 字符的重叠，保证语义连续性。
    """
    if not text or not text.strip():
        return []

    # 按段落分割
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]

    # 第一步：按段落合并，生成初步 chunks
    raw_chunks: list[str] = []
    current_chunk = ""

    for para in paragraphs:
        if len(current_chunk) + len(para) + 1 <= chunk_size:
            current_chunk = f"{current_chunk}\n{para}" if current_chunk else para
        else:
            if current_chunk:
                raw_chunks.append(current_chunk.strip())
            if len(para) > chunk_size:
                sub_chunks = _split_by_sentences(para, chunk_size)
                raw_chunks.extend(sub_chunks)
                current_chunk = ""
            else:
                current_chunk = para

    if current_chunk.strip():
        raw_chunks.append(current_chunk.strip())

    if not raw_chunks:
        return []

    # 第二步：添加重叠
    if chunk_overlap <= 0 or len(raw_chunks) <= 1:
        return raw_chunks

    chunks: list[str] = [raw_chunks[0]]
    for i in range(1, len(raw_chunks)):
        prev = raw_chunks[i - 1]
        # 取上一个 chunk 末尾 chunk_overlap 个字符作为重叠前缀
        overlap_text = prev[-chunk_overlap:]
        # 尝试在句子边界切割重叠部分
        for sep in ["。", "！", "？", "；", ".", "!", "?", "\n"]:
            idx = overlap_text.find(sep)
            if idx != -1:
                overlap_text = overlap_text[idx + 1:]
                break
        overlap_text = overlap_text.strip()
        if overlap_text:
            chunks.append(f"{overlap_text}\n{raw_chunks[i]}")
        else:
            chunks.append(raw_chunks[i])

    return chunks


def _split_by_sentences(
    text: str, chunk_size: int
) -> list[str]:
    """按句子切分长文本"""
    delimiters = ["。", "！", "？", "；", ".", "!", "?", ";", "\n"]
    sentences: list[str] = []
    current = ""

    for char in text:
        current += char
        if char in delimiters and current.strip():
            sentences.append(current.strip())
            current = ""

    if current.strip():
        sentences.append(current.strip())

    chunks: list[str] = []
    current_chunk = ""

    for sent in sentences:
        if len(current_chunk) + len(sent) + 1 <= chunk_size:
            current_chunk = f"{current_chunk}{sent}" if current_chunk else sent
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = sent

    if current_chunk:
        chunks.append(current_chunk)

    return chunks
