"""rag_engine / server 工具层核心单元测试

embedding 与 rerank 均使用假实现：
- embedding 用字符频率向量（L2 归一化），文本越相似余弦越高；
- rerank 在 fixture 中统一被 patch 为返回 None（走"精排不可用"降级路径），
  _rerank_documents 自身的行为用假 dashscope 模块单独验证。
因此所有测试均不访问 DashScope 网络，可离线运行。
"""

import asyncio
import hashlib
import json
import math
import os
import sys
import types

import pytest

import rag_engine
from config import Config
from rag_engine import (
    SUPPORTED_EXTENSIONS,
    RAGEngine,
    _BM25Index,
    _chunk_id,
    _cosine_similarity,
    _has_supported_extension,
    _normalize_source,
    _read_text,
    _rerank_documents,
    _rrf_fuse,
    _sha256_file,
    _tokenize,
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
    """独立 Chroma 目录 + 假 embedding + 屏蔽网络精排的引擎实例"""
    monkeypatch.setattr(Config, "CHROMA_PERSIST_DIR", str(tmp_path / "chroma"))
    monkeypatch.setattr(rag_engine, "_embed_batch", _fake_embed_batch)
    # 默认走"精排不可用"降级路径（.env 可能带真实 DASHSCOPE_API_KEY，绝不能真调）
    monkeypatch.setattr(rag_engine, "_rerank_documents", lambda query, docs: None)
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
# 分词 / BM25 / RRF（混合检索的纯函数层）
# ---------------------------------------------------------------------- #


def test_tokenize_mixes_ascii_runs_and_cjk_bigrams():
    tokens = _tokenize("重邮教〔2025〕15号 v4.0 Machine")
    assert "machine" in tokens  # 大小写不敏感
    assert "2025" in tokens and "15" in tokens  # 文号中的数字保留
    assert "v4.0" in tokens  # 带小数点的 ASCII run
    assert {"重邮", "邮教", "教号"} <= set(tokens)  # 汉字二元组


def test_tokenize_single_han_char():
    assert _tokenize("号") == ["号"]


def test_bm25_index_ranks_matching_chunk_first():
    entries = [
        ("c1", "推免遴选工作实施细则", {}),
        ("c2", "食堂本周菜单与营业时间", {}),
        ("c3", "创新创业学分认定办法", {}),
    ]
    index = _BM25Index(entries)

    hits = index.search("推免遴选", limit=5)
    assert hits, "应至少命中一个块"
    top_idx, top_score = hits[0]
    assert entries[top_idx][0] == "c1"
    assert top_score > 0

    # 全部查询词元都不在语料中时无命中
    assert index.search("完全不存在的词汇xyz", limit=5) == []


def test_rrf_fuse_prefers_consensus_entries():
    fused = _rrf_fuse([["a", "b"], ["b", "c"]], rrf_k=60)
    # b 同时出现在两路且名次靠前，融合分应最高
    assert fused["b"] > fused["a"] > fused["c"]
    assert _rrf_fuse([], rrf_k=60) == {}


def test_cosine_similarity():
    assert _cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert _cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)
    assert _cosine_similarity([1.0], [1.0, 2.0]) == 0.0  # 长度不一致
    assert _cosine_similarity(None, [1.0]) == 0.0
    assert _cosine_similarity([0.0, 0.0], [1.0, 1.0]) == 0.0  # 零向量


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
    # 检索元数据可供排查：两路召回都应有候选
    assert payload["retrieval"]["vector_candidates"] > 0
    assert payload["retrieval"]["bm25_candidates"] > 0


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
# 检索（精排与降级）
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
    assert payload["retrieval"]["reranked"] is False  # fixture 中精排不可用


def test_search_rerank_filters_and_surfaces_scores(engine, tmp_path, monkeypatch):
    p1 = _write(tmp_path, "a.txt", "alpha content about scholarships alpha alpha")
    p2 = _write(tmp_path, "b.txt", "beta content about canteens beta beta")
    engine.load_document(p1)
    engine.load_document(p2)

    def fake_rerank(query, docs):
        return [0.9 if "alpha" in d else 0.05 for d in docs]

    monkeypatch.setattr(rag_engine, "_rerank_documents", fake_rerank)

    payload = engine.search("alpha")
    assert payload["error"] is None
    assert payload["count"] >= 1
    assert all("alpha" in r["text"] for r in payload["results"])  # beta 块被精排过滤
    assert all(r["rerank_score"] >= Config.RERANK_THRESHOLD for r in payload["results"])
    assert payload["retrieval"]["reranked"] is True
    assert payload["retrieval"]["rerank_model"] == Config.RERANK_MODEL
    assert payload["retrieval"]["threshold_used"] == Config.RERANK_THRESHOLD


def test_search_rerank_all_filtered_hint(engine, tmp_path, monkeypatch):
    path = _write(tmp_path, "d.txt", ML_DOC)
    engine.load_document(path)
    monkeypatch.setattr(rag_engine, "_rerank_documents", lambda q, docs: [0.02] * len(docs))

    payload = engine.search("anything")
    assert payload["count"] == 0
    assert payload["results"] == []
    assert payload["best_rerank_score"] == 0.02
    assert "精排最高分" in payload["hint"]
    assert "已全部过滤" in payload["hint"]


def test_search_fallback_keeps_bm25_hits_below_vector_threshold(engine, tmp_path, monkeypatch):
    """精排不可用降级时：BM25 命中的关键词块保留（向量阈值再高也不丢精确 token 命中）"""
    p1 = _write(tmp_path, "hit.txt", "apple banana cherry")
    p2 = _write(tmp_path, "miss.txt", "long unrelated sentence about nothing particular")
    engine.load_document(p1)
    engine.load_document(p2)

    monkeypatch.setattr(Config, "SCORE_THRESHOLD", 0.99)  # 拉高阈值让向量侧全部不达标

    payload = engine.search("apple")
    assert payload["count"] == 1
    assert payload["results"][0]["source"] == _normalize_source(p1)


# ---------------------------------------------------------------------- #
# _rerank_documents（用假 dashscope 模块验证，不触网）
# ---------------------------------------------------------------------- #


def _install_fake_dashscope(monkeypatch, call_impl):
    """把 sys.modules['dashscope'] 换成只含 TextReRank 的假模块"""
    fake = types.ModuleType("dashscope")
    fake.TextReRank = type("TextReRank", (), {"call": staticmethod(call_impl)})
    monkeypatch.setitem(sys.modules, "dashscope", fake)


def test_rerank_documents_parses_scores_and_passes_request_timeout(monkeypatch):
    monkeypatch.setattr(Config, "RERANK_ENABLED", True)
    monkeypatch.setattr(Config, "DASHSCOPE_API_KEY", "sk-test")
    monkeypatch.setattr(Config, "RERANK_MAX_RETRIES", 1)
    captured = {}

    class FakeResponse:
        status_code = 200
        output = {
            "results": [
                {"index": 1, "relevance_score": 0.8},
                {"index": 0, "relevance_score": 0.4},
            ]
        }

    def fake_call(model, query, documents, top_n, return_documents, request_timeout):
        captured.update(
            model=model, query=query, documents=documents, request_timeout=request_timeout
        )
        return FakeResponse()

    _install_fake_dashscope(monkeypatch, fake_call)

    scores = _rerank_documents("q", ["doc-a", "doc-b"])
    assert scores == [0.4, 0.8]  # 按 index 回填对齐
    assert captured["model"] == Config.RERANK_MODEL
    # 必须用 request_timeout 传参（直接传 timeout 会被 SDK 塞进请求体而静默失效）
    assert captured["request_timeout"] == Config.RERANK_TIMEOUT


def test_rerank_documents_retries_then_returns_none(monkeypatch):
    monkeypatch.setattr(Config, "RERANK_ENABLED", True)
    monkeypatch.setattr(Config, "DASHSCOPE_API_KEY", "sk-test")
    monkeypatch.setattr(Config, "RERANK_MAX_RETRIES", 2)
    monkeypatch.setattr(rag_engine.time, "sleep", lambda _s: None)  # 防真实等待
    calls = []

    def flaky(**_kwargs):
        calls.append(1)
        raise RuntimeError("network down")

    _install_fake_dashscope(monkeypatch, flaky)

    assert _rerank_documents("q", ["a"]) is None  # 失败 -> 调用方降级
    assert len(calls) == 2  # 重试了一次


def test_rerank_documents_none_when_disabled_or_no_key(monkeypatch):
    monkeypatch.setattr(Config, "RERANK_ENABLED", False)
    assert _rerank_documents("q", ["a"]) is None

    monkeypatch.setattr(Config, "RERANK_ENABLED", True)
    monkeypatch.setattr(Config, "DASHSCOPE_API_KEY", "")
    assert _rerank_documents("q", ["a"]) is None

    assert _rerank_documents("q", []) == []  # 空文档列表直接返回空分数表


# ---------------------------------------------------------------------- #
# MCP 工具层（server.py 的入参校验与调度）
# ---------------------------------------------------------------------- #


def test_server_tool_validation(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "CHROMA_PERSIST_DIR", str(tmp_path / "chroma"))
    monkeypatch.setattr(rag_engine, "_embed_batch", _fake_embed_batch)
    import server  # 引擎初始化需在 Config 打补丁之后

    assert "不支持的文件格式" in asyncio.run(server.load_document(str(tmp_path / "x.exe")))
    assert "仅支持 PDF" in asyncio.run(server.load_pdf(str(tmp_path / "a.txt")))
    # 空问题在触达检索前就应返回错误（不经过 embed / 网络）
    assert "问题不能为空" in asyncio.run(server.search(""))
