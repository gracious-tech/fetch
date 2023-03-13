<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<!-- Transform USX3 to plain text

All non-biblical text is removed.

-->

    <!-- Import additional templates -->
    <xsl:include href="control_chars.xslt" />
    <xsl:include href="ignore.xslt" />

    <!-- General output settings -->
    <xsl:output method="text" indent="no" use-character-maps="control_chars" />
    <xsl:strip-space elements="usx" /><!-- WARN Don't strip within paragraphs or words will join -->

    <!-- Doc root -->
    <xsl:template match="usx">
        <xsl:apply-templates />
    </xsl:template>

    <!-- Ignore non-biblical data that is usually included in HTML -->
    <xsl:template match="verse[@eid]" />
    <xsl:template match="note" />
    <xsl:template match="ref" />
    <xsl:template match="para[@style='ms']|para[@style='ms1']|para[@style='ms2']|para[@style='ms3']|para[@style='ms4']|para[@style='mr']" />
    <xsl:template match="para[@style='s']|para[@style='s1']|para[@style='s2']|para[@style='s3']|para[@style='s4']|para[@style='sr']|para[@style='r']" />
    <xsl:template match="para[@style='sp']" />

    <!-- Preserve chapter markers as [c:1] -->
    <xsl:template match="chapter[@sid]">
        <xsl:text>[</xsl:text>
        <xsl:value-of select="@number" />
        <xsl:text>:1]</xsl:text>
    </xsl:template>

    <!-- Preserve verse markers as [v] -->
    <xsl:template match="verse[@sid]">
        <xsl:if test="@number != '1'">
            <xsl:text>[</xsl:text>
            <xsl:value-of select="@number" />
            <xsl:text>]</xsl:text>
        </xsl:if>
    </xsl:template>

    <!-- Add only 1 newline after poetry "paragraphs" -->
    <xsl:template match="para[@style='q']|para[@style='q1']|para[@style='q2']|para[@style='q3']|para[@style='q4']">
        <xsl:apply-templates />
        <xsl:text>&#xA;</xsl:text>
    </xsl:template>

    <!-- Add 2 newlines after paragraphs -->
    <xsl:template match="para">
        <xsl:apply-templates />
        <xsl:text>&#xA;&#xA;</xsl:text>
    </xsl:template>

    <!-- Include node contents without node element or attributes -->
    <xsl:template match="node()">
        <xsl:apply-templates />
    </xsl:template>

    <!-- Copy plain text as is -->
    <xsl:template match="text()">
        <xsl:copy />
    </xsl:template>

</xsl:stylesheet>
