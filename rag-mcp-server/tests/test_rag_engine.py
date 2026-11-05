"""rag_engine / server 工具层核心单元测试

embedding 使用字符频率假实现（L2 归一化），文本越相似余弦越高，
因此所有测试均不访问 DashScope 网络，可离线运行。
"""

import asyncio
import hashlib
import json
import math
import os

import pytest

import rag_engine
from config import Config
from rag_engine import (
    SUPPORTED_EXTENSIONS,
    RAGEngine,
    _chunk_id,
    _has_supported_extension,
    _normalize_source,
    _read_text,
    _sha256_file,
    results_to_text,
)

_DIM = 64

# 纯英文样例文本，避免与中文标点类字符混淆相似度判断
ML_DOC = "Machine learning studies algorithms that improve through experience. " * 8


def _fake_embed_batch(texts: list[str]) -> list[list[float]]:
    """字符频率向量：查询字符都出现在文档中时余弦较高，完全不相交时为 0"""
    vectors = []
    for text in texts:
        v = [0.0] * _DIM
        for ch in text:
            v[ord(ch) % _DIM] += 1.0
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        vectors.append([x / norm for x in v])
    return vectors


@pytest.fixture
def engine(tmp_path, monkeypatch):
    """独立 Chroma 目录 + 假 embedding 的引擎实例"""
    monkeypatch.setattr(Config, "CHROMA_PERSIST_DIR", str(tmp_path / "chroma"))
    monkeypatch.setattr(rag_engine, "_embed_batch", _fake_embed_batch)
    return RAGEngine()


def _write(tmp_path, name: str, content: str, encoding: str = "utf-8") -> str:
    path = tmp_path / name
    path.write_text(content, encoding=encoding)
    return str(path)


# ---------------------------------------------------------------------- #
# 纯函数
# ---------------------------------------------------------------------- #


def test_normalize_source_unifies_separators_and_dots():
    assert _normalize_source(" D://a//x/./b.pdf ") == _normalize_source("D:/a/x/b.pdf")


@pytest.mark.skipif(os.name != "nt", reason="仅 Windows 文件路径不区分大小写")
def test_normalize_source_case_insensitive_on_windows():
    assert _normalize_source("D:\\Docs\\A.PDF") == _normalize_source("d:/docs/a.pdf")


def test_has_supported_extension():
    for ext in sorted(SUPPORTED_EXTENSIONS):
        assert _has_supported_extension(f"a{ext}")
    assert not _has_supported_extension("a.doc")  # 旧版 .doc 不支持
    assert not _has_supported_extension("a.exe")


def test_sha256_file(tmp_path):
    path = tmp_path / "f.bin"
    path.write_bytes(b"hello")
    assert _sha256_file(str(path)) == hashlib.sha256(b"hello").hexdigest()


def test_chunk_id_deterministic_and_content_sensitive():
    same_1 = _chunk_id("s.pdf", "h1", "文本")
    same_2 = _chunk_id("s.pdf", "h1", "文本")
    other = _chunk_id("s.pdf", "h1", "别的")
    assert same_1 == same_2
    assert same_1 != other
    assert same_1.startswith("h1_")


@pytest.mark.parametrize(
    ("content", "encoding"),
    [("中文内容", "utf-8"), ("中文内容", "utf-8-sig"), ("中文内容", "gbk")],
)
def test_read_text_encoding_fallback(tmp_path, content, encoding):
    path = tmp_path / "f.txt"
    path.write_bytes(content.encode(encoding))
    assert _read_text(str(path)) == content


def test_results_to_text_keeps_chinese_readable():
    payload = {"results": [{"text": "检索增强生成"}], "count": 1, "error": None}
    text = results_to_text(payload)
    assert "检索增强生成" in text  # ensure_ascii=False
    assert json.loads(text) == payload


# ---------------------------------------------------------------------- #
# 加载与去重
# ---------------------------------------------------------------------- #


def test_load_txt_dedupe_and_search(engine, tmp_path):
    path = _write(tmp_path, "notes.txt", ML_DOC)

    assert "成功加载文档" in engine.load_document(path)
    count_after_first = engine.collection.count()
    assert count_after_first > 0

    assert "跳过" in engine.load_document(path)
    assert engine.collection.count() == count_after_first

    payload = engine.search("Machine learning studies algorithms")
    assert payload["error"] is None
    assert payload["count"] > 0
    top = payload["results"][0]
    assert top["similarity"] >= Config.SCORE_THRESHOLD
    assert top["page"] is None  # 非 PDF 格式无页码
    assert top["source"] == _normalize_source(path)


def test_load_update_replaces_old_chunks(engine, tmp_path):
    path = _write(tmp_path, "doc.md", "alpha release note with old content")
    engine.load_document(path)
    docs = engine.collection.get(include=["documents"])["documents"]
    assert any("alpha" in d for d in docs)

    _write(tmp_path, "doc.md", "beta release note with new content")
    assert "成功加载文档" in engine.load_document(path)

    docs = engine.collection.get(include=["documents"])["documents"]
    assert not any("alpha" in d for d in docs)
    assert any("beta" in d for d in docs)


def test_load_rejects_bad_input(engine, tmp_path):
    assert "不能为空" in engine.load_document("  ")
    assert "不支持的文件格式" in engine.load_document(str(tmp_path / "x.exe"))


def test_load_docx_paragraphs_and_tables(engine, tmp_path):
    docx = pytest.importorskip("docx")
    path = tmp_path / "report.docx"
    document = docx.Document()
    document.add_paragraph("docx paragraph about retrieval augmented generation")
    table = document.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "表格"
    table.rows[0].cells[1].text = "内容"
    document.save(str(path))

    assert "成功加载文档" in engine.load_document(str(path))
    joined = "".join(engine.collection.get(include=["documents"])["documents"])
    assert "retrieval augmented generation" in joined
    assert "表格" in joined and "内容" in joined


@pytest.mark.skipif(os.name != "nt", reason="仅 Windows 文件路径不区分大小写")
def test_windows_case_insensitive_dedupe_and_delete(engine, tmp_path):
    path = _write(tmp_path, "Doc.TXT", "windows case test content")
    alt = path.upper()  # 整条路径改大小写，指向同一文件

    assert "成功加载文档" in engine.load_document(path)
    assert "跳过" in engine.load_document(alt)  # 大小写不同不会重复入库

    assert "已删除文档" in engine.delete_document(alt)
    assert engine.collection.count() == 0


# ---------------------------------------------------------------------- #
# 检索
# ---------------------------------------------------------------------- #


def test_search_hint_when_all_filtered(engine, tmp_path):
    path = _write(tmp_path, "doc.md", ML_DOC)
    engine.load_document(path)

    assert engine.search("")["error"] == "问题不能为空"

    payload = engine.search("zzzqqq")  # z/q 不在文档中，相似度恒为 0
    assert payload["error"] is None
    assert payload["count"] == 0
    assert payload["best_similarity"] < Config.SCORE_THRESHOLD
    assert "已全部过滤" in payload["hint"]


# ---------------------------------------------------------------------- #
# 文档管理
# ---------------------------------------------------------------------- #


def test_list_and_delete_roundtrip(engine, tmp_path):
    p1 = _write(tmp_path, "a.txt", "alpha document content")
    p2 = _write(tmp_path, "b.txt", "beta document content")
    engine.load_document(p1)
    engine.load_document(p2)

    listing = engine.list_documents()
    assert listing["count"] == 2
    assert {d["source"] for d in listing["documents"]} == {
        _normalize_source(p1),
        _normalize_source(p2),
    }

    assert "已删除文档" in engine.delete_document(_normalize_source(p1))
    assert engine.list_documents()["count"] == 1
    assert engine.delete_document(p1) == f"知识库中不存在该文档: {p1}"


# ---------------------------------------------------------------------- #
# MCP 工具层（server.py 的入参校验与调度）
# ---------------------------------------------------------------------- #


def test_server_tool_validation(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "CHROMA_PERSIST_DIR", str(tmp_path / "chroma"))
    monkeypatch.setattr(rag_engine, "_embed_batch", _fake_embed_batch)
    import server  # 引擎初始化需在 Config 打补丁之后

    assert "不支持的文件格式" in asyncio.run(server.load_document(str(tmp_path / "x.exe")))
    assert "仅支持 PDF" in asyncio.run(server.load_pdf(str(tmp_path / "a.txt")))
