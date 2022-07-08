<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

<!-- Some Microsoft character encodings use the control chars range for printable chars

Documents are expected to be in UTF-8, but if any control chars encountered, assume windows chars...

-->
<xsl:character-map name="control_chars">
    <xsl:output-character character="&#127;" string=""/><!-- DEL in CP1252 -->
    <xsl:output-character character="&#128;" string="&#x20AC;"/><!-- EURO SIGN in CP1252 -->
    <xsl:output-character character="&#129;" string=""/><!-- UNDEFINED in CP1252 -->
    <xsl:output-character character="&#130;" string="&#x201A;"/><!-- SINGLE LOW-9 QUOTATION MARK in CP1252 -->
    <xsl:output-character character="&#131;" string="&#x0192;"/><!-- LATIN SMALL LETTER F WITH HOOK in CP1252 -->
    <xsl:output-character character="&#132;" string="&#x201E;"/><!-- DOUBLE LOW-9 QUOTATION MARK in CP1252 -->
    <xsl:output-character character="&#133;" string="&#x2026;"/><!-- HORIZONTAL ELLIPSIS in CP1252 -->
    <xsl:output-character character="&#134;" string="&#x2020;"/><!-- DAGGER in CP1252 -->
    <xsl:output-character character="&#135;" string="&#x2021;"/><!-- DOUBLE DAGGER in CP1252 -->
    <xsl:output-character character="&#136;" string="&#x02C6;"/><!-- MODIFIER LETTER CIRCUMFLEX ACCENT in CP1252 -->
    <xsl:output-character character="&#137;" string="&#x2030;"/><!-- PER MILLE SIGN in CP1252 -->
    <xsl:output-character character="&#138;" string="&#x0160;"/><!-- LATIN CAPITAL LETTER S WITH CARON in CP1252 -->
    <xsl:output-character character="&#139;" string="&#x2039;"/><!-- SINGLE LEFT-POINTING ANGLE QUOTATION MARK in CP1252 -->
    <xsl:output-character character="&#140;" string="&#x0152;"/><!-- LATIN CAPITAL LIGATURE OE in CP1252 -->
    <xsl:output-character character="&#141;" string="&#x02D8;"/><!-- BREVE in CP1252 -->
    <xsl:output-character character="&#142;" string="&#x017D;"/><!-- LATIN CAPITAL LETTER Z WITH CARON in CP1252 -->
    <xsl:output-character character="&#143;" string=""/><!-- UNDEFINED in CP1252 -->
    <xsl:output-character character="&#144;" string=""/><!-- UNDEFINED in CP1252 -->
    <xsl:output-character character="&#145;" string="&#x2018;"/><!-- LEFT SINGLE QUOTATION MARK in CP1252 -->
    <xsl:output-character character="&#146;" string="&#x2019;"/><!-- RIGHT SINGLE QUOTATION MARK in CP1252 -->
    <xsl:output-character character="&#147;" string="&#x201C;"/><!-- LEFT DOUBLE QUOTATION MARK in CP1252 -->
    <xsl:output-character character="&#148;" string="&#x201D;"/><!-- RIGHT DOUBLE QUOTATION MARK in CP1252 -->
    <xsl:output-character character="&#149;" string="&#x2022;"/><!-- BULLET in CP1252 -->
    <xsl:output-character character="&#150;" string="&#x2013;"/><!-- EN DASH in CP1252 -->
    <xsl:output-character character="&#151;" string="&#x2014;"/><!-- EM DASH in CP1252 -->
    <xsl:output-character character="&#152;" string="&#x02DC;"/><!-- SMALL TILDE in CP1252 -->
    <xsl:output-character character="&#153;" string="&#x2122;"/><!-- TRADE MARK SIGN in CP1252 -->
    <xsl:output-character character="&#154;" string="&#x0161;"/><!-- LATIN SMALL LETTER S WITH CARON in CP1252 -->
    <xsl:output-character character="&#155;" string="&#x203A;"/><!-- SINGLE RIGHT-POINTING ANGLE QUOTATION MARK in CP1252 -->
    <xsl:output-character character="&#156;" string="&#x0153;"/><!-- LATIN SMALL LIGATURE OE in CP1252 -->
    <xsl:output-character character="&#157;" string="&#x02DD;"/><!-- DOUBLE ACUTE ACCENT in CP1252 -->
    <xsl:output-character character="&#158;" string="&#x017E;"/><!-- LATIN SMALL LETTER Z WITH CARON in CP1252 -->
    <xsl:output-character character="&#159;" string="&#x0178;"/><!-- LATIN CAPITAL LETTER Y WITH DIAERESIS in CP1252 -->
</xsl:character-map>

</xsl:stylesheet>
