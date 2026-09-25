"""Shared helpers for the Opus Ball football database pipeline."""
import os
import re
import unicodedata
from difflib import SequenceMatcher

SRC = os.environ.get("OPUS_SRC", "/tmp/claude-0/data")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC = os.path.join(ROOT, "public")

STOP = {
    "fc", "afc", "cf", "sc", "ac", "ssc", "as", "cd", "ud", "sd", "rc", "rcd", "sv", "tsg",
    "bsc", "fk", "sk", "if", "bk", "club", "de", "del", "la", "the", "calcio", "football",
    "futbol", "cfc", "us", "ss", "acf", "fsv", "kv", "krc", "kaa", "rsc", "osc", "aj", "ogc",
    "bc", "fcv", "ksv", "vv", "cp", "sl", "sad", "ca", "ec", "se", "cr", "fbc", "hsc", "ea",
    "1", "hnk", "gnk", "nk", "jk", "fb", "a", "e", "vfl", "vfb", "spvgg", "tsv", "ssv", "dsc",
    "sg", "kvc", "ksc", "hc", "hsv", "sco", "estac", "rb", "rsca", "psv", "utd", "united",
}
KEEP_EVEN_IF_STOP = {"united", "psv", "hsv", "rb"}


def strip_accents(s: str) -> str:
    s = s.replace("ø", "o").replace("Ø", "O").replace("æ", "ae").replace("ß", "ss").replace("ł", "l").replace("Ł", "L")
    s = s.replace("ı", "i").replace("đ", "d").replace("ð", "d")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm(name: str, keep_all=False) -> str:
    s = strip_accents(name).lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    toks = s.split()
    if keep_all:
        return " ".join(toks)
    out = [t for t in toks if t not in STOP or t in KEEP_EVEN_IF_STOP]
    # drop founding years like 1846, 1909
    out = [t for t in out if not re.fullmatch(r"(18|19|20)\d\d", t)]
    return " ".join(out) if out else " ".join(toks)


def sim(a: str, b: str) -> float:
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    r = SequenceMatcher(None, na, nb).ratio()
    ta, tb = set(na.split()), set(nb.split())
    if ta and tb:
        j = len(ta & tb) / len(ta | tb)
        r = max(r, 0.55 + 0.45 * j if ta & tb else r)
        if ta <= tb or tb <= ta:
            r = max(r, 0.9)
    return r


def best_match(name, candidates, threshold=0.72):
    best, score = None, 0.0
    for c in candidates:
        s = sim(name, c)
        if s > score:
            best, score = c, s
    return (best, score) if score >= threshold else (None, score)


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", strip_accents(s).lower()).strip("-")
